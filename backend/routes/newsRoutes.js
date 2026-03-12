// backend/routes/newsRoutes.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const News = require('../models/news');
const User = require('../models/User');
const Connection = require('../models/Connection');
const { authenticateToken } = require('./authRoutes'); // Import authenticateToken from authRoutes

// ===================================
// POST NEWS ROUTE (ALUMNI ONLY)
// ===================================
router.post('/news', authenticateToken, async (req, res) => {
    console.log('📰 POST /news - Request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('User:', req.user);
    try {
        const { title, content, category } = req.body;
        const userId = req.user.userId;
        const userType = req.user.userType;

        // Check if user is alumni
        if (userType !== 'alumni') {
            return res.status(403).json({ message: 'Only alumni can post news.' });
        }

        // Validate inputs
        if (!title || !content) {
            console.error('❌ Missing title or content:', { title, content });
            return res.status(400).json({ message: 'Title and content are required.' });
        }

        // Convert userId string to ObjectId
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.error('❌ Invalid user ID format:', userId);
            return res.status(400).json({ message: 'Invalid user ID format.' });
        }
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Get author details
        const author = await User.findById(userObjectId).select('fullName');
        if (!author) {
            console.error('❌ User not found for ID:', userObjectId);
            return res.status(404).json({ message: 'User not found.' });
        }

        console.log('Creating news object with:', { title, content, authorId: userObjectId, authorName: author.fullName, category: category || 'General Update' });

        const newNews = new News({
            title,
            content,
            authorId: userObjectId,
            authorName: author.fullName,
            category: category || 'General Update',
            createdAt: new Date()
        });

        console.log('Attempting to save news...');
        await newNews.save();
        console.log('✅ News saved:', newNews._id);
        res.status(201).json({ 
            message: 'News posted successfully!', 
            news: newNews 
        });
    } catch (error) {
        console.error('❌ Error posting news:', error);
        console.error('Full error stack:', error.stack);
        // Ensure we send JSON response, not HTML
        res.status(500).json({ message: 'Server error while posting news.', error: error.message });
    }
});

// ===================================
// GET NEWS ROUTE (FILTERED FOR CONNECTED ALUMNI)
// ===================================
// For Students: Shows news from only connected alumni
// For Alumni: Shows all alumni news
router.get('/news', authenticateToken, async (req, res) => {
    console.log('📰 GET /news - Request received for user:', req.user?.userId);
    try {
        const userId = req.user.userId;
        const userType = req.user.userType;

        // Convert userId string to ObjectId for database queries
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid user ID format.' });
        }
        const userObjectId = new mongoose.Types.ObjectId(userId);

        let filter;

        if (userType === 'student') {
            console.log('📚 Student requested news - fetching from connected alumni only');
            // Get all connections where this student is connected to alumni
            const connections = await Connection.find({
                $or: [
                    { requesterId: userObjectId, status: 'Accepted' },
                    { recipientId: userObjectId, status: 'Accepted' }
                ]
            }).select('requesterId recipientId');

            // Extract the alumni IDs (the other person in the connection)
            const connectedAlumniIds = connections.map(conn => {
                return conn.requesterId.toString() === userId ? conn.recipientId : conn.requesterId;
            });

            console.log(`Found ${connectedAlumniIds.length} connected alumni`);

            // Get news from only connected alumni
            filter = { authorId: { $in: connectedAlumniIds } };
        } else if (userType === 'alumni') {
            console.log('👨‍🎓 Alumni requested news - showing all alumni news');
            // Alumni can see all alumni news
            filter = {};
        } else {
            return res.status(403).json({ message: 'Invalid user type.' });
        }

        const news = await News.find(filter)
            .sort({ createdAt: -1 })
            .populate('authorId', 'fullName profession graduationYear')
            .limit(50);

        console.log(`✅ Found ${news.length} news items`);
        res.json(news);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ message: 'Server error while fetching news.' });
    }
});

// ===================================
// GET SINGLE NEWS ROUTE
// ===================================
router.get('/news/:newsId', authenticateToken, async (req, res) => {
    try {
        const { newsId } = req.params;
        const userId = req.user.userId;
        const userType = req.user.userType;

        if (!mongoose.Types.ObjectId.isValid(newsId)) {
            return res.status(400).json({ message: 'Invalid news ID.' });
        }

        // Convert userId string to ObjectId for database queries
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid user ID format.' });
        }
        const userObjectId = new mongoose.Types.ObjectId(userId);

        const news = await News.findById(newsId).populate('authorId', 'fullName profession graduationYear');
        if (!news) {
            return res.status(404).json({ message: 'News not found.' });
        }

        // Check access permissions
        if (userType === 'student') {
            // Student can only view news from connected alumni
            const isConnected = await Connection.findOne({
                $or: [
                    { requesterId: userObjectId, recipientId: news.authorId, status: 'Accepted' },
                    { requesterId: news.authorId, recipientId: userObjectId, status: 'Accepted' }
                ]
            });

            if (!isConnected) {
                return res.status(403).json({ message: 'You cannot view this news.' });
            }
        }

        res.json(news);
    } catch (error) {
        console.error('Error fetching news:', error);
        res.status(500).json({ message: 'Server error while fetching news.' });
    }
});

module.exports = { router, authenticateToken };
