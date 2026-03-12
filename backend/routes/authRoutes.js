// backend/routes/authRoutes.js

const express = require('express');
const router = express.Router(); 
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User'); // Ensure this path is correct

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Reusable Auth middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    if (!token) return res.status(401).json({ message: 'Access token is missing or invalid.' });

    jwt.verify(token, JWT_SECRET, (err, payload) => {
        if (err) return res.status(401).json({ message: 'Token verification failed.' });
        req.user = payload;
        next();
    });
};

// ===================================
// LOGIN ROUTE
// ===================================
router.post('/login', async (req, res) => {
    const { email, password, userType } = req.body;
    
    if (!email || !password || !userType) {
        return res.status(400).json({ message: 'Email, password, and userType required.' });
    }

    try {
        const user = await User.findOne({ email, userType }); 
        if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials.' });

        const token = jwt.sign({ userId: user._id.toString(), userType: user.userType }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userType: user.userType, userId: user._id.toString() }); // Include userId for client use
    } catch (error) {
        console.error('Unified Login Error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

// ===================================
// REGISTRATION ROUTE (FINAL, ROBUST VERSION)
// ===================================
router.post('/register', async (req, res) => {
    const { email, password, userType, fullName, graduationYear, profession, batch, workingField, companyName, department, areaOfInterest } = req.body || {};
    
    if (!email || !password || !userType || !fullName) { // fullName is required for both types
        return res.status(400).json({ message: 'Missing required fields: full name, email, password and userType are required.' });
    }
    if (typeof password === 'string' && password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    }

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(409).json({ message: 'User with this email already exists.' });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const registrationData = {
            email,
            password: hashedPassword,
            userType,
            fullName,
        };

        if (userType === 'alumni') {
            // Safely convert to number, Mongoose handles null if conversion fails or field is empty
            registrationData.graduationYear = graduationYear ? Number(graduationYear) : null; 
            registrationData.profession = profession || ''; 
            registrationData.batch = batch || '';
            registrationData.workingField = workingField || '';
            registrationData.companyName = companyName || '';
        } else if (userType === 'student') {
            registrationData.department = department || '';
            registrationData.areaOfInterest = Array.isArray(areaOfInterest) ? areaOfInterest : (areaOfInterest ? areaOfInterest.toString().split(',').map(s=>s.trim()).filter(s=>s) : []);
        }

        const newUser = await User.create(registrationData);

        const token = jwt.sign({ userId: newUser._id.toString(), userType }, JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ token, userType, userId: newUser._id.toString() }); 
    } catch (error) {
        // ENHANCED ERROR REPORTING (This is critical for debugging the Mongoose model)
        if (error.name === 'ValidationError') {
            const fields = Object.keys(error.errors || {}).map(k => `${k}: ${error.errors[k].message}`).join('; ');
            console.error('Mongoose Validation Error:', fields);
            return res.status(400).json({ message: `Validation failed. Check required fields: ${fields}` });
        }
        if (error.code === 11000) {
            return res.status(409).json({ message: 'Duplicate email. User already exists.' });
        }
        console.error('General Registration Error:', error); 
        res.status(500).json({ message: 'Server error during registration. Check server logs for details.' });
    }
});

// ===================================
// ALUMNI SEARCH ROUTE
// ===================================
router.get('/alumni/search', authenticateToken, async (req, res) => {
    try {
        const { keyword, major, graduationYear } = req.query;
        
        // Build search filter
        const filter = { userType: 'alumni' };
        
        if (keyword) {
            const regex = new RegExp(keyword, 'i');
            filter.$or = [
                { fullName: regex },
                { profession: regex },
                { email: regex }
            ];
        }
        
        if (major) {
            const majorRegex = new RegExp(major, 'i');
            filter.major = majorRegex;
        }
        
        if (graduationYear) {
            filter.graduationYear = parseInt(graduationYear);
        }
        
        // Find alumni matching criteria, exclude password
        const results = await User.find(filter).select('-password').limit(50);
        
        res.json(results);
    } catch (error) {
        console.error('Alumni Search Error:', error);
        res.status(500).json({ message: 'Server error during search.' });
    }
});

// ===================================
// ALUMNI COUNT ROUTE
// ===================================
router.get('/alumni/count', authenticateToken, async (req, res) => {
    try {
        const count = await User.countDocuments({ userType: 'alumni' });
        res.json({ count });
    } catch (error) {
        console.error('Alumni Count Error:', error);
        res.status(500).json({ message: 'Server error fetching alumni count.' });
    }
});

module.exports = { router, authenticateToken };