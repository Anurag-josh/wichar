const mongoose = require('mongoose');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: () => crypto.randomUUID()
    },
    name: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['patient', 'caregiver'],
        required: true
    },
    linkCode: {
        type: String,
        required: true,
        unique: true
    },
    linkedUsers: [{
        type: String,
        ref: 'User'
    }]
}, {
    timestamps: true // adds createdAt and updatedAt
});

module.exports = mongoose.model('User', userSchema);
