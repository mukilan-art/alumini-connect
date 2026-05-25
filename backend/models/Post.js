const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Author ID is required']
    },
    title: {
        type: String,
        required: [true, 'Title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    content: {
        type: String,
        required: [true, 'Content is required'],
        maxlength: [5000, 'Content cannot exceed 5000 characters']
    },
    category: {
        type: String,
        enum: ['General Update', 'Career Advice', 'Industry News', 'Mentorship Tips', 'Event Announcement', 'Job Vacancy', 'Internship', 'Workshop / Event', 'Career Opportunity', 'Other'],
        default: 'General Update'
    },
    domain: {
        type: String,
        trim: true,
        maxlength: [100, 'Domain cannot exceed 100 characters']
    },
    location: {
        type: String,
        trim: true,
        maxlength: [200, 'Location cannot exceed 200 characters']
    },
    applyLink: {
        type: String,
        trim: true
    },
    eventDate: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('Post', PostSchema);
