const path = require('path');
const fs = require('fs');
const user_collection = require("../models/userModel");
const society_collection = require("../models/societyModel");
const tenantDb = require("./tenantDb");

// Helper to generate ethnic names
function getRandomEthnicName(region, isMuslim, gender = 'male') {
    const gujaratFirstNames = ['Rajesh', 'Sanjay', 'Amit', 'Vijay', 'Ketan', 'Hiren', 'Dhaval', 'Pankaj', 'Jayesh', 'Tushar', 'Jignesh', 'Bhavesh', 'Hardik', 'Parth', 'Nirav', 'Mahendra', 'Ramesh', 'Suresh', 'Bharat', 'Arvind', 'Pravin'];
    const gujaratSurnames = ['Patel', 'Shah', 'Mehta', 'Joshi', 'Trivedi', 'Vyas', 'Vaghela', 'Parmar', 'Solanki', 'Gadhvi', 'Raval', 'Panchal', 'Chauhan', 'Dave', 'Pandya', 'Bhatt', 'Gajjar', 'Mistry', 'Soni', 'Kothari'];
    const gujaratFemaleNames = ['Nehal', 'Riya', 'Kavya', 'Krisha', 'Nidhi', 'Vishwa', 'Pooja', 'Dhara', 'Bijal', 'Hetvi', 'Asha', 'Falguni', 'Geeta', 'Hema', 'Ila', 'Jyoti', 'Kokila', 'Lata', 'Meena', 'Nisha'];

    const bengaluruFirstNames = ['Ananth', 'Ramesh', 'Suresh', 'Manjunath', 'Nagaraj', 'Raghavendra', 'Karthik', 'Srinivas', 'Prashanth', 'Girish', 'Harish', 'Chethan', 'Sandesh', 'Venkatesh', 'Guru', 'Shankar', 'Pradeep', 'Raghu', 'Kiran', 'Satish'];
    const bengaluruSurnames = ['Hegde', 'Rao', 'Reddy', 'Gowda', 'Bhat', 'Murthy', 'Iyengar', 'Nayak', 'Shenoy', 'Pai', 'Prabhu', 'Kulkarni', 'Joshi', 'Deshpande', 'Shetty', 'Venkatesh', 'Kamath', 'Bhagwat', 'Acharya'];
    const bengaluruFemaleNames = ['Aanya', 'Diya', 'Meghana', 'Shreya', 'Anupama', 'Preethi', 'Sindhu', 'Kavitha', 'Sowmya', 'Rashmi', 'Bharathi', 'Devi', 'Ganga', 'Indira', 'Lakshmi', 'Nalini', 'Parvathi', 'Radha', 'Saraswathi', 'Uma'];

    const muslimFirstNames = ['Ahmed', 'Ali', 'Yusuf', 'Ibrahim', 'Omar', 'Hamza', 'Mustafa', 'Zayd', 'Imran', 'Faisal', 'Tariq', 'Sajid', 'Farhan', 'Kamran', 'Zafar', 'Arshad', 'Asif', 'Riaz', 'Sohail', 'Yasir'];
    const muslimSurnames = ['Khan', 'Sheikh', 'Ahmed', 'Ali', 'Syed', 'Mohammed', 'Pathan', 'Mirza', 'Qureshi', 'Siddiqui', 'Ansari', 'Malik', 'Choudhary', 'Raza', 'Naqvi', 'Zaidi', 'Farooqui', 'Ghori', 'Jafri'];
    const muslimFemaleNames = ['Zahra', 'Fatima', 'Aisha', 'Maryam', 'Zainab', 'Sana', 'Farah', 'Yasmin', 'Nadia', 'Amara', 'Asma', 'Bushra', 'Hina', 'Iram', 'Kiran', 'Lubna', 'Madiha', 'Nazia', 'Saba', 'Uzma'];

    let firstNames = gujaratFirstNames;
    let surnames = gujaratSurnames;

    if (isMuslim) {
        firstNames = gender === 'female' ? muslimFemaleNames : muslimFirstNames;
        surnames = muslimSurnames;
    } else if (region === 'Karnataka' || region === 'Bangalore') {
        firstNames = gender === 'female' ? bengaluruFemaleNames : bengaluruFirstNames;
        surnames = bengaluruSurnames;
    } else {
        firstNames = gender === 'female' ? gujaratFemaleNames : gujaratFirstNames;
        surnames = gujaratSurnames;
    }

    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = surnames[Math.floor(Math.random() * surnames.length)];
    return { firstName: first, lastName: last };
}

// Seeding function
async function seedSystemData() {
    console.log("Starting database seeding overhaul...");
    try {
        const User = user_collection.User;
        const Society = society_collection.Society;

        // Clear existing collections for fresh hyper-realistic data seed
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

        // 1. Seed Global Super Admin
        const superAdminEmail = 'quisoft.in@gmail.com';
        const superAdminPass = 'admin123';
        await User.register({
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

        // Seed Universal Demo Users for testing all roles (via dropdown helper)
        const demoRoles = [
            { email: 'demo+super_admin@quisoft.in', role: 'super_admin', isAdmin: true, societyName: 'System', flatNumber: 'System' },
            { email: 'demo+society_admin@quisoft.in', role: 'society_admin', isAdmin: true, societyName: 'Prestige Kingfisher Towers', flatNumber: 'Admin-Off' },
            { email: 'demo+resident@quisoft.in', role: 'resident', isAdmin: false, societyName: 'Prestige Kingfisher Towers', flatNumber: 'A-402' },
            { email: 'demo+security_guard@quisoft.in', role: 'security_guard', isAdmin: false, societyName: 'Prestige Kingfisher Towers', flatNumber: 'Gate-1' }
        ];

        for (const dr of demoRoles) {
            await User.register({
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

        // 30 Premium Societies List
        const luxurySocieties = [
            { name: "Prestige Kingfisher Towers", address: "4, Vittal Mallya Road", city: "Bangalore", district: "Karnataka", pincode: 560001, plan: "gold" },
            { name: "Phoenix One Bangalore West", address: "1, Dr. Rajkumar Road, Rajajinagar", city: "Bangalore", district: "Karnataka", pincode: 560010, plan: "silver" },
            { name: "Total Environment Windmills of Your Mind", address: "Basavanna Nagar, Whitefield", city: "Bangalore", district: "Karnataka", pincode: 560066, plan: "enterprise" },
            { name: "Embassy Boulevard", address: "Hosahalli, Hunasur Road", city: "Bangalore", district: "Karnataka", pincode: 562157, plan: "gold" },
            { name: "Sobha Royal Pavilion", address: "Sarjapur Main Road", city: "Bangalore", district: "Karnataka", pincode: 560035, plan: "bronze" },
            { name: "Karle Infra Zenith", address: "Nagavara", city: "Bangalore", district: "Karnataka", pincode: 560045, plan: "silver" },
            { name: "Mantri Alpyne Premium Enclave", address: "Uttarahalli Hobli", city: "Bangalore", district: "Karnataka", pincode: 560061, plan: "bronze" },
            { name: "Purva Whitehall", address: "Sarjapur Road", city: "Bangalore", district: "Karnataka", pincode: 560102, plan: "silver" },
            { name: "Salarpuria Sattva Magnificia", address: "Old Madras Road", city: "Bangalore", district: "Karnataka", pincode: 560016, plan: "gold" },
            { name: "Brigade Exotica", address: "Old Madras Road", city: "Bangalore", district: "Karnataka", pincode: 560049, plan: "enterprise" },
            { name: "Assetz Marq Elite", address: "Whitefield Hope Farm Junction", city: "Bangalore", district: "Karnataka", pincode: 560067, plan: "silver" },
            { name: "Godrej Woodland Estate", address: "Sarjapur Road", city: "Bangalore", district: "Karnataka", pincode: 562125, plan: "bronze" },
            { name: "Adarsh Palm Retreat", address: "Outer Ring Road", city: "Bangalore", district: "Karnataka", pincode: 560103, plan: "gold" },
            { name: "Vaishnavi Terraces", address: "Jayanagar", city: "Bangalore", district: "Karnataka", pincode: 560041, plan: "silver" },
            { name: "Shriram Chirping Woods", address: "Sarjapur Road", city: "Bangalore", district: "Karnataka", pincode: 560102, plan: "bronze" },
            { name: "Adani Shantigram Water Lily", address: "Sarkhej - Gandhinagar Highway", city: "Ahmedabad", district: "Gujarat", pincode: 382421, plan: "enterprise" },
            { name: "Arvind Uplands Premium Pavilion", address: "Nasmed", city: "Ahmedabad", district: "Gujarat", pincode: 382721, plan: "gold", isMuslimEnclave: true },
            { name: "Goyal & Co. Riviera Elite", address: "Prahlad Nagar", city: "Ahmedabad", district: "Gujarat", pincode: 380015, plan: "silver" },
            { name: "Shaligram Prime Royale", address: "Ambli", city: "Ahmedabad", district: "Gujarat", pincode: 380058, plan: "gold" },
            { name: "Iscon Platinum Towers", address: "Bopal", city: "Ahmedabad", district: "Gujarat", pincode: 380058, plan: "silver" },
            { name: "Sangath Silver Sky", address: "Motera", city: "Ahmedabad", district: "Gujarat", pincode: 380005, plan: "bronze", isMuslimEnclave: true },
            { name: "Venus Riviera Enclave", address: "Vejalpur", city: "Ahmedabad", district: "Gujarat", pincode: 380051, plan: "bronze", isMuslimEnclave: true },
            { name: "Rajhans Elita Premium", address: "Pal", city: "Surat", district: "Gujarat", pincode: 395009, plan: "gold" },
            { name: "Green Group Signature Towers", address: "Adajan", city: "Surat", district: "Gujarat", pincode: 395009, plan: "silver" },
            { name: "Avadh Viceroy Residences", address: "Dumas Road", city: "Surat", district: "Gujarat", pincode: 395007, plan: "enterprise", isMuslimEnclave: true },
            { name: "Sun Reality Solitaire", address: "Vesu", city: "Surat", district: "Gujarat", pincode: 395007, plan: "silver" },
            { name: "Happy Home Celebrity Greens", address: "Vesu", city: "Surat", district: "Gujarat", pincode: 395007, plan: "bronze" },
            { name: "Alembic Kiara Royal Residency", address: "Chhani", city: "Vadodara", district: "Gujarat", pincode: 391740, plan: "gold" },
            { name: "Narayan Heritage Square", address: "Gotri", city: "Vadodara", district: "Gujarat", pincode: 390021, plan: "silver" },
            { name: "Woodside Premium Orchards", address: "Sevasi", city: "Vadodara", district: "Gujarat", pincode: 391101, plan: "bronze" }
        ];

        // Seed 30 premium societies
        for (const ls of luxurySocieties) {
            const slug = ls.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const isBengaluru = ls.district === "Karnataka";
            const isMuslim = ls.isMuslimEnclave === true;

            // Base quota settings
            let storageQuota = 500;
            if (ls.plan === 'silver') storageQuota = 2000;
            if (ls.plan === 'gold') storageQuota = 5000;
            if (ls.plan === 'enterprise') storageQuota = 50000;

            const adminEmail = `admin@${slug}.quisoft.in`;

            // Create society document
            const soc = new Society({
                societyName: ls.name,
                societyAddress: {
                    address: ls.address,
                    city: ls.city,
                    district: ls.district,
                    postalCode: ls.pincode
                },
                admin: adminEmail,
                activeAGM: adminEmail,
                status: 'approved',
                subscriptionPlan: ls.plan,
                storageQuotaMb: storageQuota,
                storageUsedMb: Math.random() * 45,
                // Add some realistic initial dynamic bills to the bills array
                bills: [
                    {
                        title: "Elevator Annual Safety Audit",
                        amount: 350,
                        month: "June",
                        year: 2026,
                        targetFlat: "All",
                        status: "unpaid"
                    },
                    {
                        title: "CCTV Integration & Guard Cabling",
                        amount: 150,
                        month: "June",
                        year: 2026,
                        targetFlat: "All",
                        status: "unpaid"
                    }
                ]
            });
            await soc.save();
            console.log(`Seeded Luxury Society: ${ls.name}`);

            // Fetch tenant models
            const Vehicle = tenantDb.getTenantModel(ls.name, 'Vehicle');
            const BillingLog = tenantDb.getTenantModel(ls.name, 'BillingLog');
            const Booking = tenantDb.getTenantModel(ls.name, 'Booking');
            const Amenity = tenantDb.getTenantModel(ls.name, 'Amenity');
            const Staff = tenantDb.getTenantModel(ls.name, 'Staff');
            const Notice = tenantDb.getTenantModel(ls.name, 'Notice');

            // Clear tenant collections just in case
            await Vehicle.deleteMany({});
            await BillingLog.deleteMany({});
            await Booking.deleteMany({});
            await Amenity.deleteMany({});
            await Staff.deleteMany({});
            await Notice.deleteMany({});

            // 1. Generate role emails and passwords
            const roleSuperAdminEmail = `superadmin@${slug}.quisoft.in`;
            const roleSuperAdminPass = `superadmin_${slug}_pass`;

            const roleSocietyAdminEmail = `admin@${slug}.quisoft.in`;
            const roleSocietyAdminPass = `admin_${slug}_pass`;

            const roleGuardEmail = `guard@${slug}.quisoft.in`;
            const roleGuardPass = `guard_${slug}_pass`;

            const roleResidentEmail = `resident@${slug}.quisoft.in`;
            const roleResidentPass = `resident_${slug}_pass`;

            // Ethnic details for roles
            const nameSuper = getRandomEthnicName(ls.district, isMuslim, 'male');
            const nameAdmin = getRandomEthnicName(ls.district, isMuslim, 'male');
            const nameGuard = getRandomEthnicName(ls.district, isMuslim, 'male');
            const nameResident = getRandomEthnicName(ls.district, isMuslim, 'male');

            // Register these roles in the main User collection
            // A. Super Admin associated with society (System management perspective)
            await User.register({
                username: roleSuperAdminEmail,
                firstName: nameSuper.firstName,
                lastName: nameSuper.lastName + " (Super)",
                phoneNumber: 9000000000 + Math.floor(Math.random() * 99999999),
                role: 'super_admin',
                isAdmin: true,
                validation: 'approved',
                societyName: ls.name,
                flatNumber: 'Admin-Off'
            }, roleSuperAdminPass);
            logCredentials('Super Admin', roleSuperAdminEmail, roleSuperAdminPass, ls.name);

            // B. Society AGM / Admin
            await User.register({
                username: roleSocietyAdminEmail,
                firstName: nameAdmin.firstName,
                lastName: nameAdmin.lastName + " (AGM)",
                phoneNumber: 9000000000 + Math.floor(Math.random() * 99999999),
                role: 'society_admin',
                isAdmin: true,
                validation: 'approved',
                societyName: ls.name,
                flatNumber: 'Admin-Off'
            }, roleSocietyAdminPass);
            logCredentials('Society Admin', roleSocietyAdminEmail, roleSocietyAdminPass, ls.name);

            // C. Security Guard
            await User.register({
                username: roleGuardEmail,
                firstName: nameGuard.firstName,
                lastName: nameGuard.lastName + " (Guard)",
                phoneNumber: 9000000000 + Math.floor(Math.random() * 99999999),
                role: 'security_guard',
                isAdmin: false,
                validation: 'approved',
                societyName: ls.name,
                flatNumber: 'Gate-1'
            }, roleGuardPass);
            logCredentials('Security Guard', roleGuardEmail, roleGuardPass, ls.name);

            // D. Standard Resident (owner role)
            const familyResident = [
                { name: `${getRandomEthnicName(ls.district, isMuslim, 'female').firstName} ${nameResident.lastName}`, relation: 'Spouse', phoneNumber: String(7000000000 + Math.floor(Math.random() * 2999999999)) }
            ];
            await User.register({
                username: roleResidentEmail,
                firstName: nameResident.firstName,
                lastName: nameResident.lastName,
                phoneNumber: 8000000000 + Math.floor(Math.random() * 1999999999),
                role: 'owner',
                isAdmin: false,
                validation: 'approved',
                societyName: ls.name,
                flatNumber: 'A-101',
                familyMembers: familyResident,
                kidsCount: 1,
                kidsNames: [getRandomEthnicName(ls.district, isMuslim, 'male').firstName],
                makePayment: 2900 // base maintenance charges + dynamic bills
            }, roleResidentPass);
            logCredentials('Resident', roleResidentEmail, roleResidentPass, ls.name);

            // 2. Scale resident occupancy dynamically: seed 18 to 35 unique family units per society.
            const residentUnitsCount = 18 + Math.floor(Math.random() * 15);
            const seededResidents = [];

            // Add the standard role resident to our seeded residents array to generate resources for him
            const standardResidentUser = await User.findOne({ username: roleResidentEmail });
            if (standardResidentUser) {
                seededResidents.push(standardResidentUser);
            }

            for (let i = 2; i <= residentUnitsCount; i++) {
                const block = ['A', 'B', 'C', 'D'][i % 4];
                const flatNo = `${block}-${100 + i}`;
                const email = `resident${i}@${slug}.quisoft.in`;

                const nameRes = getRandomEthnicName(ls.district, isMuslim, 'male');
                const surname = nameRes.lastName;

                // Add spouse
                const spouseName = getRandomEthnicName(ls.district, isMuslim, 'female').firstName;
                const family = [
                    { name: `${spouseName} ${surname}`, relation: 'Spouse', phoneNumber: String(7000000000 + Math.floor(Math.random() * 2999999999)) }
                ];

                // Generate kids details
                const kidsListBengaluru = ['Aditya', 'Aanya', 'Chandan', 'Diya', 'Ketan', 'Meghana', 'Pranav', 'Shreya', 'Varun', 'Tejas', 'Rohan', 'Tanvi', 'Anjali', 'Sanjay', 'Vikram'];
                const kidsListGujarat = ['Aarav', 'Dhairya', 'Kavya', 'Krisha', 'Manav', 'Nidhi', 'Parth', 'Riya', 'Smit', 'Vishwa', 'Dev', 'Diya', 'Het', 'Ishita', 'Jia'];
                const kidsListMuslim = ['Zahra', 'Ali', 'Fatima', 'Yusuf', 'Aisha', 'Ibrahim', 'Maryam', 'Omar', 'Zainab', 'Hamza', 'Bilal', 'Rayya', 'Sana', 'Sara', 'Zayan'];

                const kidsChoices = isMuslim ? kidsListMuslim : (isBengaluru ? kidsListBengaluru : kidsListGujarat);
                const kidsCount = 1 + Math.floor(Math.random() * 2); // 1 or 2 kids
                const kidsNames = [];

                for (let k = 0; k < kidsCount; k++) {
                    const kidName = kidsChoices[(i + k * 7) % kidsChoices.length];
                    kidsNames.push(kidName);
                    family.push({
                        name: `${kidName} ${surname}`,
                        relation: 'Child',
                        phoneNumber: ''
                    });
                }

                // Register standard resident
                const residentUser = await User.register({
                    username: email,
                    firstName: nameRes.firstName,
                    lastName: surname,
                    phoneNumber: 8000000000 + Math.floor(Math.random() * 1999999999),
                    role: 'owner',
                    isAdmin: false,
                    validation: 'approved',
                    societyName: ls.name,
                    flatNumber: flatNo,
                    familyMembers: family,
                    kidsCount: kidsCount,
                    kidsNames: kidsNames,
                    makePayment: 2900 // June outstanding dues
                }, 'demo');

                seededResidents.push(residentUser);
            }

            // 3. Seed vehicles for seeded residents
            const stateCode = isBengaluru ? 'KA' : 'GJ';
            // Determine district codes
            let districtNo = '03';
            if (!isBengaluru) {
                if (ls.city === 'Ahmedabad') districtNo = Math.random() > 0.5 ? '01' : '27';
                else if (ls.city === 'Surat') districtNo = Math.random() > 0.5 ? '05' : '19';
                else if (ls.city === 'Vadodara') districtNo = '06';
            } else {
                districtNo = ['01', '02', '03', '04', '05', '51', '53'][Math.floor(Math.random() * 7)];
            }

            const vehicleTypes = ['Sedan', 'SUV', 'Hatchback', 'Two-Wheeler'];

            for (let idx = 0; idx < seededResidents.length; idx++) {
                const res = seededResidents[idx];
                // 90% own a vehicle
                if (Math.random() < 0.9) {
                    const type = vehicleTypes[idx % vehicleTypes.length];
                    const letters = String.fromCharCode(65 + (idx % 26)) + String.fromCharCode(65 + ((idx + 5) % 26));
                    const numPart = String(1000 + (idx * 13) % 9000);
                    const plate = `${stateCode}-${districtNo}-${letters}-${numPart}`;

                    await Vehicle.create({
                        flatNumber: res.flatNumber,
                        ownerName: `${res.firstName} ${res.lastName}`,
                        vehicleType: type,
                        plateNumber: plate,
                        stickerNumber: `STK-${res.flatNumber}-${10 + (idx % 90)}`,
                        status: 'registered'
                    });
                }
            }

            // 4. Seed baseline staff
            const staffRoles = ['guard', 'housekeeper', 'electrician', 'plumber', 'gardener'];
            for (let idx = 0; idx < staffRoles.length; idx++) {
                const sRole = staffRoles[idx];
                const staffName = getRandomEthnicName(ls.district, isMuslim, 'male');
                await Staff.create({
                    name: `${staffName.firstName} ${staffName.lastName}`,
                    role: sRole,
                    phoneNumber: String(9100000000 + Math.floor(Math.random() * 899999999)),
                    rating: 4.2 + (idx % 8) * 0.1,
                    status: 'active',
                    attendance: [
                        { date: new Date().toLocaleDateString(), status: 'present' }
                    ]
                });
            }

            // 5. Seed common amenities
            const amenitiesList = [
                { name: 'Clubhouse', capacity: 50, description: 'Royal grand party hall and recreational hub' },
                { name: 'Swimming Pool', capacity: 20, description: 'Premium azure infinity pool with temperature control' },
                { name: 'Party Hall', capacity: 150, description: 'Sophisticated event hall for private celebrations' },
                { name: 'Sports Court', capacity: 8, description: 'Synthetic multipurpose court for tennis and badminton' },
                { name: 'Garden', capacity: 100, description: 'Lush green landscaped lawns and walking tracks' },
                { name: 'Parking Space', capacity: 1, description: 'Dedicated EV charging enabled parking bay' },
                { name: 'Basement', capacity: 5, description: 'Underground safe storage vault' }
            ];
            for (const am of amenitiesList) {
                await Amenity.create(am);
            }

            // 6. Seed Notices
            await Notice.create({
                date: new Date().toLocaleDateString(),
                subject: 'Monsoon Safety Guidelines & Audits',
                details: 'In preparation for monsoon, the society association is executing structural audits for balconies, drainage networks, and elevator shafts.'
            });

            // 7. Seed Billing Log history (March, April, May = paid, June = unpaid)
            const months = ['March', 'April', 'May', 'June'];
            for (const res of seededResidents) {
                const baseCharges = soc.maintenanceBill.societyCharges + soc.maintenanceBill.sinkingFund + soc.maintenanceBill.waterCharges + soc.maintenanceBill.repairsAndMaintenance + soc.maintenanceBill.parkingCharges;
                
                for (let mIdx = 0; mIdx < months.length; mIdx++) {
                    const mName = months[mIdx];
                    const isPaid = mIdx < 3; // June is unpaid
                    const penalties = isPaid ? 0 : 200;
                    const finalAmount = baseCharges + penalties + (isPaid ? 0 : 500); // add dynamic bills to unpaid month

                    await BillingLog.create({
                        flatNumber: res.flatNumber,
                        userId: res._id,
                        month: mName,
                        year: 2026,
                        amount: finalAmount,
                        status: isPaid ? 'paid' : 'unpaid',
                        invoiceNo: `INV-2026-${mName.substring(0,3).toUpperCase()}-${res.flatNumber}`,
                        paymentDate: isPaid ? new Date(2026, mIdx + 2, 5 + (mIdx * 3) % 10) : null,
                        details: {
                            maintenance: soc.maintenanceBill.societyCharges + soc.maintenanceBill.repairsAndMaintenance,
                            sinkingFund: soc.maintenanceBill.sinkingFund,
                            waterCharges: soc.maintenanceBill.waterCharges,
                            parkingCharges: soc.maintenanceBill.parkingCharges,
                            penalties: penalties
                        }
                    });
                }
            }

            // 8. Seed simulated Amenity Bookings (historical, current, and upcoming)
            // Historical
            for (let idx = 0; idx < Math.min(seededResidents.length, 5); idx++) {
                const res = seededResidents[idx];
                await Booking.create({
                    amenityName: amenitiesList[idx % amenitiesList.length].name,
                    flatNumber: res.flatNumber,
                    userId: res._id,
                    userName: `${res.firstName} ${res.lastName}`,
                    date: '2026-06-15',
                    slot: '09:00 AM - 12:00 PM',
                    status: 'approved'
                });
            }

            // Current (Today)
            for (let idx = 0; idx < Math.min(seededResidents.length, 3); idx++) {
                const res = seededResidents[idx];
                await Booking.create({
                    amenityName: amenitiesList[(idx + 2) % amenitiesList.length].name,
                    flatNumber: res.flatNumber,
                    userId: res._id,
                    userName: `${res.firstName} ${res.lastName}`,
                    date: '2026-06-18', // Today
                    slot: '05:00 PM - 08:00 PM',
                    status: 'approved'
                });
            }

            // Upcoming
            for (let idx = 0; idx < Math.min(seededResidents.length, 4); idx++) {
                const res = seededResidents[idx];
                await Booking.create({
                    amenityName: amenitiesList[(idx + 4) % amenitiesList.length].name,
                    flatNumber: res.flatNumber,
                    userId: res._id,
                    userName: `${res.firstName} ${res.lastName}`,
                    date: '2026-06-20',
                    slot: '08:00 PM - 11:00 PM',
                    status: 'approved'
                });
            }
        }

        console.log("--- SYSTEM SEEDING OVERHAUL COMPLETED SUCCESSFULLY ---");
    } catch (e) {
        console.error('Seeding error:', e);
        throw e;
    }
}

module.exports = {
    seedSystemData
};
