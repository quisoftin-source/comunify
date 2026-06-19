// Local mock test of the AI Notice generator logic from server.js

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function mockGenerateNotice(rawPrompt) {
    const prompt = rawPrompt.toLowerCase().trim();
    let subject = "";
    let details = "";

    if (prompt.startsWith('dear') || prompt.length > 100) {
        details = rawPrompt;
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
        const timeRegex = /(?:\b\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b)\s*(?:to|and|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b))|(?:\bfrom\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b)\s+to\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|am\b|pm\b))/i;
        const timeMatch = rawPrompt.match(timeRegex);
        const timeStr = timeMatch ? timeMatch[0] : "";

        const dateRegex = /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|on\s+\d{1,2}(?:st|nd|rd|th)?\s+\w+|\d{1,2}\/\d{1,2}\/\d{4})\b/i;
        const dateMatch = rawPrompt.match(dateRegex);
        const dateStr = dateMatch ? dateMatch[0] : "tomorrow";

        const liftMatch = rawPrompt.match(/\b(lift\s+[a-zA-Z0-9]|elevator\s+[a-zA-Z0-9])\b/i);
        const liftName = liftMatch ? capitalize(liftMatch[0]) : "Lift A";

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
    return { subject, details };
}

// Test cases
const tests = [
    {
        name: "Test 1: Full user-drafted notice should not be changed",
        prompt: "Dear Residents,\n\nPlease note that Lift A will be shut down tomorrow from 01:00 PM to 03:00 PM due to scheduled AMC safety checks and cleaning.\n\nPlease use Lift B during this period.\n\nManagement Office"
    },
    {
        name: "Test 2: Lift B brief should preserve Lift B",
        prompt: "Lift B is down tomorrow 2pm-5pm for wire repairs. Use Lift A instead."
    },
    {
        name: "Test 3: Water prompt with custom time & reason",
        prompt: "water cutoff on Sunday 9am-1pm due to plumbing repairs"
    }
];

tests.forEach(t => {
    console.log(`\n=== ${t.name} ===`);
    console.log(`Prompt: "${t.prompt.replace(/\n/g, ' ')}"`);
    const res = mockGenerateNotice(t.prompt);
    console.log(`Generated Subject: "${res.subject}"`);
    console.log(`Generated Details:\n${res.details}`);
});
