const mongoose = require('mongoose');
const dotenv = require('dotenv');
const tenantDb = require('./config/tenantDb');
const db = require('./config/db');

// Load env variables
dotenv.config();

async function runTenantIsolationCheck() {
    try {
        console.log('Connecting to database via resolver...');
        await db.connectDB();
        console.log('Database Connected.');

        console.log('--- Step 1: Resolve isolated models for Society A & Society B ---');
        const NoticeA = tenantDb.getTenantModel('Society Alpha', 'Notice');
        const NoticeB = tenantDb.getTenantModel('Society Beta', 'Notice');

        console.log('--- Step 2: Clear old check data ---');
        await NoticeA.deleteMany({});
        await NoticeB.deleteMany({});

        console.log('--- Step 3: Insert dataset in Society A only ---');
        await NoticeA.create({
            date: '13 Jun 2026',
            subject: 'Alpha Notice',
            details: 'Confidential message belonging to Society Alpha only.'
        });

        console.log('--- Step 4: Query databases separately to assert isolation ---');
        const countA = await NoticeA.countDocuments();
        const countB = await NoticeB.countDocuments();

        console.log(`- Notices found in Society Alpha: ${countA}`);
        console.log(`- Notices found in Society Beta: ${countB}`);

        if (countA === 1 && countB === 0) {
            console.log('\n✅ VERIFICATION SUCCESSFUL: Strict multi-tenant logical database isolation is verified.');
        } else {
            console.log('\n❌ VERIFICATION FAILED: Data leak detected across tenant connections.');
        }

    } catch (e) {
        console.error('Isolation check failed with error:', e);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed.');
    }
}

runTenantIsolationCheck();
