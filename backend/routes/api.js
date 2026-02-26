const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Medicine = require('../models/Medicine');
const Notification = require('../models/Notification');
const multer = require('multer');
const path = require('path');

// Configure multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, uniqueSuffix + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// POST /create-user
router.post('/create-user', async (req, res) => {
    try {
        const { name, role } = req.body;

        // Generate a random 6-character alphanumeric link code
        const linkCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        const user = new User({
            name,
            role,
            linkCode,
            linkedUsers: []
        });

        await user.save();

        res.json({ success: true, user });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// POST /link-user
router.post('/link-user', async (req, res) => {
    try {
        const { requesterId, linkCode } = req.body;

        const targetUser = await User.findOne({ linkCode });
        if (!targetUser) {
            return res.status(404).json({ success: false, error: 'Link code not found' });
        }

        const requester = await User.findById(requesterId);
        if (!requester) {
            return res.status(404).json({ success: false, error: 'Requester not found' });
        }

        if (requester.linkedUsers.includes(targetUser._id)) {
            return res.status(400).json({ success: false, error: 'Users are already linked' });
        }

        // Link both ways
        requester.linkedUsers.push(targetUser._id);
        targetUser.linkedUsers.push(requester._id);

        await requester.save();
        await targetUser.save();

        const populatedRequester = await User.findById(requester._id).populate('linkedUsers', 'name role');

        res.json({
            success: true,
            message: `Successfully linked to ${targetUser.name}`,
            linkedUser: targetUser,
            requester: populatedRequester
        });
    } catch (error) {
        console.error('Error linking users:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// POST /upload-medicine-image
router.post('/upload-medicine-image', upload.single('image'), async (req, res) => {
    try {
        const { medicineId } = req.body;
        if (!medicineId) {
            return res.status(400).json({ success: false, error: 'medicineId is required' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No image uploaded' });
        }

        const imageUrl = `/uploads/${req.file.filename}`;

        const medicine = await Medicine.findByIdAndUpdate(
            medicineId,
            { imageUrl },
            { new: true }
        );

        if (!medicine) {
            return res.status(404).json({ success: false, error: 'Medicine not found' });
        }

        res.json({ success: true, medicine });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// POST /add-medicine
router.post('/add-medicine', async (req, res) => {
    try {
        const { name, time, times, patientId, createdBy, totalQuantity } = req.body;

        const scheduledDate = req.body.scheduledDate || new Date().toISOString().split('T')[0];

        const timesArray = times ? times.map(t => ({ time: t, status: 'pending' })) : [{ time, status: 'pending' }];

        const medicine = new Medicine({
            name,
            times: timesArray,
            patientId,
            createdBy,
            scheduledDate,
            ...(totalQuantity !== undefined && totalQuantity !== '' && { totalQuantity: Number(totalQuantity) })
        });

        await medicine.save();

        res.json({ success: true, medicine });
    } catch (error) {
        console.error('Error adding medicine:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// GET /medicines?patientId=u1
router.get('/medicines', async (req, res) => {
    try {
        const { patientId } = req.query;
        if (!patientId) {
            return res.status(400).json({ success: false, error: 'patientId is required' });
        }
        const medicines = await Medicine.find({ patientId });
        res.json({ success: true, medicines });
    } catch (error) {
        console.error('Error fetching medicines:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// PUT /medicines/:id
router.put('/medicines/:id', async (req, res) => {
    try {
        const { name, times, totalQuantity, imageUrl } = req.body;
        const medicine = await Medicine.findById(req.params.id);
        if (!medicine) {
            return res.status(404).json({ success: false, error: 'Medicine not found' });
        }
        if (name) medicine.name = name;
        if (totalQuantity !== undefined && totalQuantity !== '') {
            medicine.totalQuantity = Number(totalQuantity);
        }
        if (imageUrl !== undefined) {
            medicine.imageUrl = imageUrl;
        }
        if (times) {
            medicine.times = times.map(t => {
                const existing = medicine.times.find(et => et.time === t);
                return existing ? existing : { time: t, status: 'pending' };
            });
        }
        await medicine.save();
        res.json({ success: true, medicine });
    } catch (error) {
        console.error('Error updating medicine:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// DELETE /medicines/:id
router.delete('/medicines/:id', async (req, res) => {
    try {
        const medicine = await Medicine.findByIdAndDelete(req.params.id);
        if (!medicine) {
            return res.status(404).json({ success: false, error: 'Medicine not found' });
        }
        res.json({ success: true, message: 'Medicine deleted successfully' });
    } catch (error) {
        console.error('Error deleting medicine:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// POST /mark-taken
router.post('/mark-taken', async (req, res) => {
    try {
        const { medicineId, patientId, time } = req.body;
        // We assume client validates patientId
        const medicine = await Medicine.findById(medicineId);
        if (!medicine) {
            return res.status(404).json({ success: false, error: 'Medicine not found' });
        }

        const timeEntry = medicine.times.find(t => t.time === time);
        if (timeEntry) {
            timeEntry.status = 'taken';
            timeEntry.dismissedAt = new Date();

            // Smart Inventory: decrement quantity when taken
            if (medicine.totalQuantity !== undefined) {
                medicine.totalQuantity = Math.max(0, medicine.totalQuantity - 1);
            }
        }
        await medicine.save();

        res.json({ success: true, message: 'Medicine marked as taken' });
    } catch (error) {
        console.error('Error marking medicine as taken:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// POST /mark-missed
router.post('/mark-missed', async (req, res) => {
    try {
        const { medicineId, patientId, time } = req.body;

        const medicine = await Medicine.findById(medicineId);
        if (!medicine) {
            return res.status(404).json({ success: false, error: 'Medicine not found' });
        }

        const timeEntry = medicine.times.find(t => t.time === time);
        if (timeEntry) {
            timeEntry.status = 'missed';
            timeEntry.missedAt = new Date();
        }
        await medicine.save();

        // Find patient to get linked caregivers
        const patient = await User.findById(patientId);
        if (!patient) {
            return res.status(404).json({ success: false, error: 'Patient not found' });
        }

        // Find all linked caregivers for this patient
        const caregivers = await User.find({
            _id: { $in: patient.linkedUsers },
            role: 'caregiver'
        });

        // Create notification for each caregiver
        for (const caregiver of caregivers) {
            const notification = new Notification({
                userId: caregiver._id,
                medicineId: medicine._id,
                patientId: patient._id,
                message: `${patient.name} missed the ${time || 'scheduled'} dose of ${medicine.name}`
            });
            await notification.save();
        }

        res.json({ success: true, message: 'Medicine marked as missed, caregiver notified' });
    } catch (error) {
        console.error('Error marking medicine as missed:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// GET /notifications?userId=u2
router.get('/notifications', async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) {
            return res.status(400).json({ success: false, error: 'userId is required' });
        }

        const notifications = await Notification.find({ userId }).sort({ createdAt: -1 });
        res.json({ success: true, notifications });
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

module.exports = router;
