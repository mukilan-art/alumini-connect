// backend/config/db.js

const mongoose = require('mongoose');
// Optional in-memory MongoDB for local CI/testing
let mongodInstance = null;
let usingInMemory = false;

const connectDB = async () => {
    try {
        if (process.env.USE_IN_MEMORY_DB === 'true') {
            // Use mongodb-memory-server when requested (dev/testing)
            const { MongoMemoryServer } = require('mongodb-memory-server');
            mongodInstance = await MongoMemoryServer.create();
            const uri = mongodInstance.getUri();
            await mongoose.connect(uri);
            usingInMemory = true;
            console.log('MongoDB in-memory started and connected ✅');
            return;
        }

        // Fallback to real MongoDB (env var or localhost)
        const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/alumni_network';
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB successfully connected ✅');
    } catch (err) {
        console.error('FATAL: MongoDB connection error:', err);
        process.exit(1);
    }
};

// Graceful stop for in-memory server
const stopInMemory = async () => {
    if (usingInMemory && mongodInstance) {
        try { await mongoose.disconnect(); await mongodInstance.stop(); console.log('In-memory MongoDB stopped.'); } catch (e) { console.warn('Failed to stop in-memory MongoDB', e); }
    }
};

process.on('SIGINT', stopInMemory);
process.on('SIGTERM', stopInMemory);

module.exports = connectDB;