const mongoose = require('mongoose');
const crypto = require('crypto');

const medicineSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: () => crypto.randomUUID()
    },
    name: {
        type: String,
        required: true
    },
    time: {
        type: String, // HH:MM format
        required: true
    },
    patientId: {
        type: String,
        ref: 'User',
        required: true
    },
    createdBy: {
        type: String,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'taken', 'missed', 'snoozed'],
        default: 'pending'
    },
    scheduledDate: {
        type: String, // YYYY-MM-DD
        required: true
    },
    dismissedAt: {
        type: Date,
        default: null
    },
    missedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true // adds createdAt
});

module.exports = mongoose.model('Medicine', medicineSchema);
