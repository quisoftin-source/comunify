const fs = require('fs');
const path = require('path');

// Read config/seed.js content
const seedPath = path.join(__dirname, '../config/seed.js');
const seedContent = fs.readFileSync(seedPath, 'utf8');

// Use regex to extract the luxurySocieties array content
const startIdx = seedContent.indexOf('const luxurySocieties = [');
const endIdx = seedContent.indexOf('];', startIdx);
const arrayStr = seedContent.substring(startIdx, endIdx + 2);

// Evaluate the array to get the societies
let luxurySocieties;
try {
    // Basic evaluation of the extracted variable string safely
    const evalFn = new Function(arrayStr + '\nreturn luxurySocieties;');
    luxurySocieties = evalFn();
} catch (e) {
    console.error('Failed to parse luxurySocieties from seed.js:', e.message);
    process.exit(1);
}

console.log(`Successfully loaded ${luxurySocieties.length} luxury societies.`);
console.log('=== VERIFYING DB NAMES & LENGTHS ===');

const dbNames = new Map();
let hasErrors = false;

luxurySocieties.forEach(soc => {
    const originalName = soc.name;
    // Mirroring formatting logic from config/tenantDb.js
    let dbName = 'soc_' + originalName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const rawLength = dbName.length;

    // Check if it exceeds 38 characters before truncation
    const exceeds38 = rawLength > 38;
    
    // Apply truncation for the check
    const finalDbName = exceeds38 ? dbName.substring(0, 38) : dbName;
    
    // Check for collisions
    if (dbNames.has(finalDbName)) {
        console.error(`❌ COLLISION DETECTED!`);
        console.error(`  - "${originalName}" maps to: "${finalDbName}"`);
        console.error(`  - Already used by: "${dbNames.get(finalDbName)}"`);
        hasErrors = true;
    } else {
        dbNames.set(finalDbName, originalName);
    }

    if (exceeds38) {
        console.warn(`⚠️ WARNING: "${originalName}" database name is too long (${rawLength} chars). Truncated to "${finalDbName}" (${finalDbName.length} chars).`);
    } else {
        console.log(`✅ OK: "${originalName}" -> "${finalDbName}" (${finalDbName.length} chars)`);
    }
});

if (hasErrors) {
    console.error('\n❌ Verification failed due to collisions or errors.');
    process.exit(1);
} else {
    console.log('\n✨ All database names are unique and safe from Atlas 38-character limit error!');
}
