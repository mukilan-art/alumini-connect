// backend/models/User.js

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    // Fields required for BOTH Student and Alumni
    fullName: {
        type: String,
        required: [true, 'Full name is required'],
        trim: true,
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true, // Ensures no two users (student or alumni) share an email
        trim: true,
        lowercase: true,
        match: [/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/, 'Please use a valid email address'],
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
    },
    userType: {
        type: String,
        required: [true, 'User type is required'],
        enum: ['student', 'alumni'],
    },

    // Fields required ONLY for Alumni (Conditional Validation)
    graduationYear: {
        type: Number,
        // CRITICAL: Only required if the userType is set to 'alumni'
        required: function() { return this.userType === 'alumni'; }, 
        min: 1900,
        max: new Date().getFullYear() + 5,
    },
    profession: {
        type: String,
        // CRITICAL: Only required if the userType is set to 'alumni'
        required: function() { return this.userType === 'alumni'; }, 
        trim: true,
    },
    batch: { type: String, trim: true },            // e.g. "Batch of 2020"
    workingField: { type: String, trim: true },    // e.g. "Software Engineering"
    companyName: { type: String, trim: true },     // current company/employer
    linkedin: { type: String, trim: true },       // optional LinkedIn URL

    // Optional fields
    major: { type: String, trim: true },
    // student-specific fields
    department: { type: String, trim: true },              // e.g. "Computer Science"
    areaOfInterest: [{ type: String, trim: true }],         // list of interests (strings)
    
    // file uploads (stored as data URLs or external links)
    certificates: [{
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        name: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now }
    }],
    gallery: [{
        _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
        name: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now }
    }],

    bio: { type: String, maxlength: 500 },
    profileImage: { type: String, default: '/images/default-profile.png' },
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);