const mongoose = require('mongoose');
const crypto = require('crypto');

const notificationSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: () => crypto.randomUUID()
    },
    userId: {
        type: String,
        ref: 'User',
        required: true
    },
    medicineId: {
        type: String,
        ref: 'Medicine',
        required: true
    },
    patientId: {
        type: String,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true // adds createdAt
});

module.exports = mongoose.model('Notification', notificationSchema);
