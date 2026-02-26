const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const path = require('path');
const fs = require('fs');

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// Routes
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Database connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/medrem_test';
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT} across all network interfaces`);
});
