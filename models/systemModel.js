const mongoose = require('mongoose');

const systemTicketSchema = new mongoose.Schema({
    date: { type: String, required: true },
    societyName: { type: String, required: true },
    adminEmail: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' }
}, { timestamps: true });

const systemAuditLogSchema = new mongoose.Schema({
    userEmail: { type: String, required: true },
    userName: { type: String, required: true },
    role: { type: String, required: true },
    action: { type: String, required: true },
    details: { type: String, required: true }
}, { timestamps: true });

exports.SystemTicket = mongoose.model('SystemTicket', systemTicketSchema);
exports.SystemAuditLog = mongoose.model('SystemAuditLog', systemAuditLogSchema);
