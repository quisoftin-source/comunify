const mongoose = require('mongoose');

const tenantConnections = {};

function getTenantDb(societyName) {
    if (!societyName) return null;
    // Format the database name nicely
    const dbName = 'society_' + societyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (tenantConnections[dbName]) {
        return tenantConnections[dbName];
    }
    // Switch connection to the specific database
    const db = mongoose.connection.useDb(dbName, { useCache: true });
    tenantConnections[dbName] = db;
    return db;
}

// Define tenant-level schemas
const NoticeSchema = new mongoose.Schema({
    date: String,
    subject: String,
    details: String,
}, { timestamps: true });

const ComplaintSchema = new mongoose.Schema({
    date: String,
    category: String, // Plumbing, Electrical, Lift, Security, Housekeeping
    type: String, // Personal / Community
    description: String,
    status: { type: String, default: 'open' }, // open, in-progress, close
    flatNumber: String,
    userId: String,
    userName: String,
    assignedStaff: String,
    comments: [{ sender: String, text: String, date: { type: Date, default: Date.now } }]
}, { timestamps: true });

const VisitorSchema = new mongoose.Schema({
    name: String,
    phone: String,
    flatNumber: String,
    type: { type: String, enum: ['guest', 'delivery', 'cab', 'other'], default: 'guest' },
    company: String, // Zomato, Amazon, Dunzo etc
    vehicleNumber: String,
    entryTime: Date,
    exitTime: Date,
    qrPassCode: String, // Used for pre-approval verification
    status: { type: String, enum: ['pre-approved', 'entered', 'exited', 'declined'], default: 'pre-approved' },
    photoUrl: { type: String, default: '/images/visitor-placeholder.png' },
    addedBy: String // Resident user ID
}, { timestamps: true });

const VehicleSchema = new mongoose.Schema({
    flatNumber: String,
    ownerName: String,
    vehicleType: { type: String, enum: ['2_wheeler', '4_wheeler', 'Sedan', 'SUV', 'Hatchback', 'Two-Wheeler'], default: '4_wheeler' },
    plateNumber: String,
    stickerNumber: String,
    status: { type: String, enum: ['registered', 'visitor', 'violation'], default: 'registered' },
    violations: [String]
}, { timestamps: true });

const AmenitySchema = new mongoose.Schema({
    name: String,
    capacity: Number,
    description: String
});

const BookingSchema = new mongoose.Schema({
    amenityName: String,
    flatNumber: String,
    userId: String,
    userName: String,
    date: String, // YYYY-MM-DD
    slot: String, // e.g. 10:00 AM - 12:00 PM, 04:00 PM - 06:00 PM
    status: { type: String, enum: ['pending', 'approved', 'cancelled'], default: 'approved' }
}, { timestamps: true });

const DocumentSchema = new mongoose.Schema({
    fileName: String,
    fileType: { type: String, enum: ['bylaws', 'minutes', 'noc', 'share_certificate', 'invoice', 'insurance', 'audit', 'other'] },
    filePath: String,
    fileSize: Number,
    uploadedBy: String,
    accessRole: { type: String, default: 'resident' } // resident, admin
}, { timestamps: true });

const StaffSchema = new mongoose.Schema({
    name: String,
    role: { type: String, enum: ['guard', 'housekeeper', 'electrician', 'plumber', 'gardener'] },
    phoneNumber: String,
    rating: { type: Number, default: 5 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    attendance: [{ date: String, status: { type: String, enum: ['present', 'absent'] } }]
}, { timestamps: true });

const VendorSchema = new mongoose.Schema({
    name: String,
    serviceType: String, // e.g. Lift maintenance, Waste disposal
    contactPerson: String,
    phoneNumber: String,
    amcStartDate: Date,
    amcEndDate: Date,
    contractValue: Number,
    ratings: [{ reviewer: String, rating: Number, comment: String }],
    payments: [{ date: Date, amount: Number, status: String, receipt: String }],
    attendance: [{ date: String, status: String }]
}, { timestamps: true });

const PollSchema = new mongoose.Schema({
    question: String,
    description: String,
    type: { 
        type: String, 
        enum: ['yes_no', 'multiple_choice', 'single_choice', 'approval', 'agm', 'election', 'budget', 'rule_change'], 
        default: 'single_choice' 
    },
    options: [String],
    votes: [{ 
        userIdHash: String, // anonymized/hashed user ID for vote encryption/tamper protection
        option: String, 
        flatNumber: String,
        timestamp: { type: Date, default: Date.now }
    }],
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    startDate: { type: Date, default: Date.now },
    endDate: Date,
    eligibleVoters: { type: String, default: 'all' }, // 'all', 'owner', 'tenant', 'resident'
    isAnonymous: { type: Boolean, default: true },
    isPublicResults: { type: Boolean, default: true },
    quorumRequirement: { type: Number, default: 0 }, // minimum count/percent of votes required
    tamperSignature: String, // Checksum hash for integrity validation
    discussionId: String // Optional linking back to original topic
}, { timestamps: true });

const DiscussionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { 
        type: String, 
        enum: ['Maintenance', 'Security', 'Parking', 'Events', 'Rules & Regulations', 'Budget', 'Infrastructure', 'Water Supply', 'Electricity', 'Housekeeping', 'New Proposal', 'General Discussion'],
        default: 'General Discussion' 
    },
    attachments: [{
        name: String,
        filePath: String,
        fileType: String
    }],
    createdBy: {
        userId: String,
        name: String,
        role: String
    },
    status: { type: String, enum: ['active', 'closed', 'converted'], default: 'active' },
    comments: [{
        text: String,
        createdBy: {
            userId: String,
            name: String
        },
        likes: [String], // Array of resident user IDs who liked
        replies: [{
            text: String,
            createdBy: {
                userId: String,
                name: String
            },
            createdAt: { type: Date, default: Date.now }
        }],
        createdAt: { type: Date, default: Date.now }
    }],
    followers: [String],
    linkedPollId: String
}, { timestamps: true });

const SurveySchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    category: { type: String, enum: ['satisfaction', 'feedback', 'maintenance', 'event', 'suggestions'], default: 'feedback' },
    createdBy: {
        userId: String,
        name: String
    },
    questions: [{
        text: String,
        type: { type: String, enum: ['text', 'rating', 'multiple_choice', 'single_choice', 'checkbox', 'scale_rating'] },
        options: [String]
    }],
    responses: [{
        userId: String,
        answers: [{
            questionIndex: Number,
            answer: mongoose.Schema.Types.Mixed
        }],
        submittedAt: { type: Date, default: Date.now }
    }],
    status: { type: String, enum: ['open', 'closed'], default: 'open' }
}, { timestamps: true });

const SuggestionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    createdBy: {
        userId: String,
        name: String,
        flatNumber: String
    },
    upvotes: [String],
    downvotes: [String]
}, { timestamps: true });

const FeedbackSchema = new mongoose.Schema({
    subject: String,
    description: String,
    rating: Number,
    createdBy: {
        userId: String,
        name: String
    }
}, { timestamps: true });

const EventSchema = new mongoose.Schema({
    title: String,
    description: String,
    date: String,
    time: String,
    rsvps: [{ userId: String, name: String, status: { type: String, enum: ['going', 'maybe', 'not_going'] } }]
}, { timestamps: true });

const CctvSchema = new mongoose.Schema({
    name: String,
    url: String,
    group: { type: String, default: 'General' }, // Gate, Lobby, Parking, Clubhouse etc
    assignedGuard: String,
    status: { type: String, enum: ['online', 'offline'], default: 'online' },
    motionAlerts: [{ timestamp: Date, snapshot: String }]
}, { timestamps: true });

const EVChargingSchema = new mongoose.Schema({
    stationId: String,
    flatNumber: String,
    userId: String,
    status: { type: String, enum: ['available', 'charging', 'offline'], default: 'available' },
    usageLogs: [{
        date: Date,
        durationMinutes: Number,
        energyKwh: Number,
        cost: Number
    }]
}, { timestamps: true });

const SmartMeterSchema = new mongoose.Schema({
    flatNumber: String,
    type: { type: String, enum: ['water', 'electricity'] },
    meterNumber: String,
    readings: [{
        date: Date,
        reading: Number,
        consumption: Number,
        amount: Number,
        billingStatus: { type: String, enum: ['unbilled', 'billed', 'paid'], default: 'unbilled' }
    }]
}, { timestamps: true });

const BillingLogSchema = new mongoose.Schema({
    flatNumber: String,
    userId: String,
    month: String,
    year: Number,
    amount: Number,
    status: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
    invoiceNo: String,
    paymentDate: Date,
    details: {
        maintenance: Number,
        sinkingFund: Number,
        waterCharges: Number,
        parkingCharges: Number,
        penalties: Number
    }
}, { timestamps: true });

const AuditLogSchema = new mongoose.Schema({
    userEmail: String,
    userName: String,
    role: String,
    action: String,
    details: String
}, { timestamps: true });

// Map of all tenant schemas
const schemas = {
    Notice: NoticeSchema,
    Complaint: ComplaintSchema,
    Visitor: VisitorSchema,
    Vehicle: VehicleSchema,
    Amenity: AmenitySchema,
    Booking: BookingSchema,
    Document: DocumentSchema,
    Staff: StaffSchema,
    Vendor: VendorSchema,
    Poll: PollSchema,
    Discussion: DiscussionSchema,
    Survey: SurveySchema,
    Suggestion: SuggestionSchema,
    Feedback: FeedbackSchema,
    Event: EventSchema,
    Cctv: CctvSchema,
    EvCharging: EVChargingSchema,
    SmartMeter: SmartMeterSchema,
    BillingLog: BillingLogSchema,
    AuditLog: AuditLogSchema
};

function getTenantModel(societyName, modelName) {
    const db = getTenantDb(societyName);
    if (!db) return null;
    const schema = schemas[modelName];
    if (!schema) {
        throw new Error(`Schema ${modelName} not found`);
    }
    // Return model bound to this specific connection
    return db.model(modelName, schema);
}

module.exports = {
    getTenantDb,
    getTenantModel
};
