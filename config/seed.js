const path = require('path');
const fs = require('fs');
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const tenantDb = require("./tenantDb");

// Seeding function
async function seedSystemData() {
    console.log("Starting database seeding (minimal configuration)...");
    try {
        const User = user_collection.User;
        const Society = society_collection.Society;

        // Clear existing collections for fresh data seed
        await User.deleteMany({});
        await Society.deleteMany({});
        console.log("Cleared User and Society collections for a clean seed.");

        const dir = path.join(__dirname, '../password');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const filePath = path.join(dir, 'passwords.txt');
        fs.writeFileSync(filePath, `--- Comunify Seeded & Registered Passwords --- \n\n`, 'utf8');

        // Write to root password.txt as well
        const rootPasswordFile = path.join(__dirname, '../password.txt');
        fs.writeFileSync(rootPasswordFile, `--- Comunify Seeded Credentials List --- \n\n`, 'utf8');

        // Helper to append passwords to files
        function logCredentials(role, email, pass, societyName) {
            const entry = `[SEEDED] Role: ${role} | Email: ${email} | Password: ${pass} | Society: ${societyName}\n`;
            fs.appendFileSync(filePath, entry, 'utf8');
            fs.appendFileSync(rootPasswordFile, entry, 'utf8');
        }

        // Helper to register user resiliently (ignoring duplicates)
        async function registerUserResilient(userObj, password) {
            try {
                return await User.register(userObj, password);
            } catch (err) {
                if (err.name === 'UserExistsError' || err.code === 11000) {
                    console.log(`[SEED WARN] User already exists: ${userObj.username}`);
                    return await User.findOne({ username: userObj.username });
                } else {
                    throw err;
                }
            }
        }

        // 1. Seed Global Super Admin
        const superAdminEmail = 'quisoft.in@gmail.com';
        const superAdminPass = 'admin123';
        await registerUserResilient({
            username: superAdminEmail,
            firstName: 'System',
            lastName: 'SuperAdmin',
            phoneNumber: 9999999999,
            role: 'super_admin',
            isAdmin: true,
            validation: 'approved',
            societyName: 'System',
            flatNumber: 'System'
        }, superAdminPass);
        logCredentials('super_admin (global)', superAdminEmail, superAdminPass, 'System');
        console.log('Seeded Global Super Admin user');

        // 2. Seed Default Demo Society ("Prestige Kingfisher Towers")
        const defaultSocietyName = "Prestige Kingfisher Towers";
        const adminEmail = "admin@prestigekingfishertowers.quisoft.in";
        const soc = new Society({
            societyName: defaultSocietyName,
            societyAddress: {
                address: "4, Vittal Mallya Road",
                city: "Bangalore",
                district: "Bangalore",
                state: "Karnataka",
                postalCode: 560001
            },
            admin: adminEmail,
            activeAGM: adminEmail,
            status: 'approved',
            subscriptionPlan: "gold",
            storageQuotaMb: 5000,
            storageUsedMb: 10
        });
        
        try {
            await soc.save();
        } catch (err) {
            if (err.code !== 11000) {
                throw err;
            }
        }
        console.log('Seeded Default Demo Society');

        // 3. Seed Universal Demo Users for testing all roles (via dropdown helper)
        const demoRoles = [
            { email: 'demo+super_admin@quisoft.in', role: 'super_admin', isAdmin: true, societyName: 'System', flatNumber: 'System' },
            { email: 'demo+society_admin@quisoft.in', role: 'society_admin', isAdmin: true, societyName: defaultSocietyName, flatNumber: 'Admin-Off' },
            { email: 'demo+resident@quisoft.in', role: 'resident', isAdmin: false, societyName: defaultSocietyName, flatNumber: 'A-402' },
            { email: 'demo+security_guard@quisoft.in', role: 'security_guard', isAdmin: false, societyName: defaultSocietyName, flatNumber: 'Gate-1' }
        ];

        for (const dr of demoRoles) {
            await registerUserResilient({
                username: dr.email,
                firstName: 'Demo',
                lastName: dr.role.replace('_', ' ').toUpperCase(),
                phoneNumber: 9999999999,
                role: dr.role,
                isAdmin: dr.isAdmin,
                validation: 'approved',
                societyName: dr.societyName,
                flatNumber: dr.flatNumber
            }, 'demo');
            logCredentials(`demo_${dr.role}`, dr.email, 'demo', dr.societyName);
        }
        console.log('Seeded Universal Demo Users');

        console.log("--- SYSTEM SEEDING OVERHAUL COMPLETED SUCCESSFULLY (MINIMAL) ---");
    } catch (e) {
        console.error('Seeding error:', e);
        throw e;
    }
}

module.exports = {
    seedSystemData
};
