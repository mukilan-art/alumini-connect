const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema({
    title: String,
    content: String,
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to the Alumni who posted
    authorName: String, // Cache of author name for quick display
    category: { type: String, enum: ['Job Opportunity', 'Industry News', 'Career Advice', 'Event', 'General Update', 'Mentorship Tips'], default: 'General Update' },
    createdAt: { type: Date, default: Date.now }
});

const News = mongoose.model('News', newsSchema);

module.exports = News;