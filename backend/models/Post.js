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
        enum: ['Career Advice', 'Industry News', 'Mentorship Tips', 'General Update', 'Event Announcement'],
        default: 'General Update'
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
