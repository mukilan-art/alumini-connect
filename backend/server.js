// backend/server.js

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
require('dotenv').config();

// 1. Import DB Connection Logic
const connectDB = require('./config/db'); 

// 2. Import Routes and Middleware
// This line DESTUCTURES the exports { router, authenticateToken } and assigns the router to authRouter
const { router: authRouter, authenticateToken } = require('./routes/authRoutes'); // Import auth routes (login/register/search, etc.)
const { router: newsRouter } = require('./routes/newsRoutes'); // Import News routes
const bcrypt = require('bcryptjs'); // used for password hashing during updates
const User = require('./models/User'); // Import User model for other routes
const Connection = require('./models/Connection'); // Import Connection model (added to support connection requests)
const Post = require('./models/Post'); // Import Post model for alumni information sharing
const News = require('./models/news'); // Import News model for alumni shared information
const Message = require('./models/Message'); // Import Message model for messaging

// 3. Execute DB Connection
connectDB(); 

const app = express();
// --- Middleware Setup ---
app.use(cors());
// allow larger payloads for base64 file uploads (certificates/gallery)
// allow larger payloads for base64 file uploads (certificates/gallery)
app.use(bodyParser.json({ limit: '25mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

// create HTTP server and attach socket.io
const server = http.createServer(app);
const io = new SocketIOServer(server, {
    cors: { origin: '*' }
});

// Real-time socket handlers
io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id, socket.handshake.query);
    const userId = socket.handshake.query.userId;
    if (userId) {
        socket.join(userId);
    }

    socket.on('joinConversation', (convId) => {
        if (convId) {
            socket.join(convId);
            console.log(`Socket ${socket.id} joined conversation ${convId}`);
        }
    });

    socket.on('leaveConversation', (convId) => {
        if (convId) socket.leave(convId);
    });

    socket.on('sendMessage', async (msg) => {
        try {
            const newMsg = new Message(msg);
            await newMsg.save();
            io.to(newMsg.conversationId).emit('newMessage', newMsg);
        } catch (e) {
            console.error('Socket sendMessage error', e);
        }
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected', socket.id);
    });
});

// Request logging middleware for debugging
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// --- Route Setup ---

// Mount Authentication Routes
// FIX: Using authRouter directly. This is the line that should resolve the TypeError.
// It maps /api/login and /api/register to the routes defined in authRoutes.js
app.use('/api', authRouter);
console.log('✅ Auth routes mounted');

// Mount News Routes
app.use('/api', newsRouter);
console.log('✅ News routes mounted');

// Test news endpoint (for debugging)
app.get('/api/news-test', (req, res) => {
    res.json({ message: 'News routes are working!' });
}); 

// =========================================================================
// REMAINDER OF ROUTES 
// =========================================================================

// Example: Get User Profile
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId.' });

        const user = await User.findById(userId).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        res.json(user);
    } catch (error) {
        console.error('Get User Error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Example: Update User Profile
app.put('/api/users/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId.' });
        if (req.user.userId !== userId) return res.status(403).json({ message: 'You are not authorized to update this profile.' });

        // allow editing of the fields exposed in the edit-form (plus password)
        const allowedUpdates = [
            'fullName',
            'profession',
            'graduationYear',
            'batch',
            'workingField',
            'companyName',
            'linkedin',
            'bio',
            'profileImage',
            'major',          // previously omitted, now included
            'department',     // student field
            'areaOfInterest', // student interests array
            'password'        // allow password change (will be hashed below)
        ];

        console.log('PUT /api/users/:userId payload:', req.body);
        const updates = {};
        for (const key of allowedUpdates) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }

        // handle password hashing if it's being updated
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updates, { new: true, runValidators: true }).select('-password');
        if (!updatedUser) return res.status(404).json({ message: 'User not found.' });

        res.json(updatedUser);
    } catch (error) {
        console.error('Update User Error:', error);
        if (error.name === 'ValidationError') {
            const fields = Object.keys(error.errors || {}).reduce((acc, k) => { acc[k] = error.errors[k].message; return acc; }, {});
            return res.status(400).json({ message: 'Validation failed', details: fields });
        }
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get a user's accepted connections (populated). Only the user themselves may retrieve this.
app.get('/api/users/:userId/connections', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId.' });
        if (req.user.userId !== userId) return res.status(403).json({ message: 'Forbidden.' });

        const user = await User.findById(userId).populate({ path: 'connections', select: 'fullName email profession profileImage' }).select('connections');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        res.json(user.connections || []);
    } catch (err) {
        console.error('Fetch user connections error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// ------------------------------------------------------------
// Uploads: certificates and gallery
// ------------------------------------------------------------

// add certificate(s) for a user (students can upload)
app.post('/api/users/:userId/certificates', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('cert upload for', userId, 'body size', JSON.stringify(req.body).length);
        console.log('auth header:', req.headers.authorization ? String(req.headers.authorization).slice(0,60) : 'none');
        if (req.user.userId !== userId) return res.status(403).json({ message: 'Unauthorized' });
        const { name, url } = req.body;
        if (!name || !url) return res.status(400).json({ message: 'Name and url are required' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        user.certificates.push({ name, url });
        await user.save();
        res.json(user.certificates);
    } catch (err) {
        console.error('Add certificate error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// get certificates for a user (public)
app.get('/api/users/:userId/certificates', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId.' });
        const user = await User.findById(userId).select('certificates');
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json(user.certificates || []);
    } catch (err) {
        console.error('Get certificates error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// add gallery item (alumni photos/docs)
app.post('/api/users/:userId/gallery', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        console.log('gallery upload for', userId, 'body size', JSON.stringify(req.body).length);
        console.log('auth header:', req.headers.authorization ? String(req.headers.authorization).slice(0,60) : 'none');
        if (req.user.userId !== userId) return res.status(403).json({ message: 'Unauthorized' });
        const { name, url } = req.body;
        if (!name || !url) return res.status(400).json({ message: 'Name and url are required' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found.' });
        user.gallery.push({ name, url });
        await user.save();
        res.json(user.gallery);
    } catch (err) {
        console.error('Add gallery item error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// get gallery items (public)
app.get('/api/users/:userId/gallery', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId.' });
        const user = await User.findById(userId).select('gallery');
        if (!user) return res.status(404).json({ message: 'User not found.' });
        res.json(user.gallery || []);
    } catch (err) {
        console.error('Get gallery error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Example: Search Route
app.get('/api/search', authenticateToken, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ message: 'Query parameter q is required.' });

        const regex = new RegExp(q, 'i');
        const results = await User.find({
            userType: 'alumni', // Filter to only search alumni
            $or: [{ fullName: regex }, { profession: regex }, { email: regex }]
        }).select('-password -userType').limit(50);

        res.json(results);
    } catch (error) {
        console.error('Search Error:', error);
        res.status(500).json({ message: 'Server error.' });
    }
});

app.get('/api/ping', (req, res) => {
    res.json({ message: "Backend is working!", time: new Date() });
});
// --- Messages API and realtime sockets ---

const mentorshipSchema = new mongoose.Schema({
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    alumniId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    studentName: String,
    subject: String,
    message: String,
    status: { type: String, enum: ['Pending', 'Accepted', 'Declined'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now }
});

const Mentorship = mongoose.model('Mentorship', mentorshipSchema);

// API to send a request (authenticated)
app.post('/api/mentorship/request', authenticateToken, async (req, res) => {
    try {
        // allow either direction: student->alumni or alumni->student
        const { alumniId, alumniEmail, studentId, studentEmail, subject, message } = req.body;
        const requesterId = req.user.userId;
        const requesterType = req.user.userType;

        let resolvedStudentId = null;
        let resolvedAlumniId = null;

        if (requesterType === 'student') {
            resolvedStudentId = requesterId;
            // resolve alumni target
            if (!alumniId && !alumniEmail) return res.status(400).json({ message: 'alumniId or alumniEmail is required.' });
            if (alumniEmail && !alumniId) {
                const alumni = await User.findOne({ email: alumniEmail, userType: 'alumni' });
                if (!alumni) return res.status(404).json({ message: 'Alumni not found.' });
                resolvedAlumniId = alumni._id;
            } else if (alumniId) {
                if (!mongoose.Types.ObjectId.isValid(alumniId)) return res.status(400).json({ message: 'Invalid alumniId.' });
                const alumni = await User.findById(alumniId);
                if (!alumni || alumni.userType !== 'alumni') return res.status(404).json({ message: 'Alumni not found.' });
                resolvedAlumniId = alumniId;
            }
        } else if (requesterType === 'alumni') {
            resolvedAlumniId = requesterId;
            // resolve student target
            if (!studentId && !studentEmail) return res.status(400).json({ message: 'studentId or studentEmail is required.' });
            if (studentEmail && !studentId) {
                const student = await User.findOne({ email: studentEmail, userType: 'student' });
                if (!student) return res.status(404).json({ message: 'Student not found.' });
                resolvedStudentId = student._id;
            } else if (studentId) {
                if (!mongoose.Types.ObjectId.isValid(studentId)) return res.status(400).json({ message: 'Invalid studentId.' });
                const student = await User.findById(studentId);
                if (!student || student.userType !== 'student') return res.status(404).json({ message: 'Student not found.' });
                resolvedStudentId = studentId;
            }
        } else {
            return res.status(400).json({ message: 'Unsupported user type.' });
        }

        const student = await User.findById(resolvedStudentId).select('fullName');
        const studentName = student ? student.fullName : '';

        const newRequest = new Mentorship({ studentId: resolvedStudentId, alumniId: resolvedAlumniId, studentName, subject, message });
        await newRequest.save();

        // Notify the alumni (if target is alumni) or student (if target is student)
        try {
            if (resolvedAlumniId) {
                const notif = new Notification({ userId: resolvedAlumniId, title: 'New Mentorship Request', message: `${studentName} requested mentorship.`, link: '/manage-mentorship.html', entityType: 'mentorship', entityId: newRequest._id });
                await notif.save();
            }
            if (requesterType === 'alumni' && resolvedStudentId) {
                const notif = new Notification({ userId: resolvedStudentId, title: 'New Mentorship Offer', message: `An alumni (${req.user.userId}) offered you mentorship.`, link: '/view-mentorship.html?id='+newRequest._id, entityType: 'mentorship', entityId: newRequest._id });
                await notif.save();
            }
        } catch (e) { console.error('Notify target failed', e); }

        res.json({ message: 'Request sent successfully!' });
    } catch (err) {
        console.error('Mentorship request error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// API to get requests for a specific Alumni
app.get('/api/mentorship/alumni/:id', async (req, res) => {
    const requests = await Mentorship.find({ alumniId: req.params.id });
    res.json(requests);
});

// API to get a single mentorship request by id
app.get('/api/mentorship/:id', async (req, res) => {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid request id.' });
    const request = await Mentorship.findById(id);
    if (!request) return res.status(404).json({ message: 'Request not found.' });
    res.json(request);
});

// API to update a mentorship request (status, etc.)
app.put('/api/mentorship/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        const { status } = req.body;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid request id.' });
        if (status && !['Pending', 'Accepted', 'Declined'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });

        const mentorship = await Mentorship.findById(id);
        if (!mentorship) return res.status(404).json({ message: 'Request not found.' });

        // Only the targeted alumni can update/accept the request
        if (String(mentorship.alumniId) !== req.user.userId) return res.status(403).json({ message: 'Forbidden.' });

        if (status) {
            mentorship.status = status;
            await mentorship.save();
        }

        // If accepted, ensure a Connection exists and users' connection lists are updated
        if (status === 'Accepted') {
            const studentId = mentorship.studentId;
            const alumniId = mentorship.alumniId;

            const existingConn = await Connection.findOne({
                $or: [
                    { requesterId: studentId, recipientId: alumniId },
                    { requesterId: alumniId, recipientId: studentId }
                ]
            });

            if (!existingConn) {
                const conn = new Connection({ requesterId: studentId, recipientId: alumniId, status: 'Accepted' });
                await conn.save();
                await User.findByIdAndUpdate(alumniId, { $addToSet: { connections: studentId } });
                await User.findByIdAndUpdate(studentId, { $addToSet: { connections: alumniId } });

                try {
                    const alumni = await User.findById(alumniId).select('fullName');
                    const notif = new Notification({ userId: studentId, title: 'Mentorship Accepted', message: `${alumni.fullName} accepted your mentorship request and is now connected.`, link: `/user-profile.html?userId=${alumniId}` });
                    await notif.save();
                } catch (e) { console.error('Notify student failed', e); }
            } else if (existingConn.status !== 'Accepted') {
                existingConn.status = 'Accepted';
                await existingConn.save();
                await User.findByIdAndUpdate(alumniId, { $addToSet: { connections: studentId } });
                await User.findByIdAndUpdate(studentId, { $addToSet: { connections: alumniId } });
            }
        }

        res.json(mentorship);
    } catch (err) {
        console.error('Update mentorship error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// --- Notifications ---
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    title: String,
    message: String,
    link: String,
    // Optional fields to reference entities (e.g., mentorship request)
    entityType: { type: String },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Notification = mongoose.model('Notification', notificationSchema);

// Create a notification (authenticated)
app.post('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const { userId, title, message, link } = req.body;
        if (!userId || !title) return res.status(400).json({ message: 'userId and title are required.' });
        const notification = new Notification({ userId, title, message, link });
        await notification.save();
        res.json(notification);
    } catch (err) {
        console.error('Create notification error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get notifications for a user (must be the user)
app.get('/api/notifications/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.userId !== userId) return res.status(403).json({ message: 'Forbidden.' });
        const notes = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(100);
        res.json(notes);
    } catch (err) {
        console.error('Fetch notifications error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Mark notification as read
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id.' });
        const updated = await Notification.findByIdAndUpdate(id, { $set: { read: true } }, { new: true });
        if (!updated) return res.status(404).json({ message: 'Notification not found.' });
        // Ensure the requester owns the notification
        if (req.user.userId !== String(updated.userId)) return res.status(403).json({ message: 'Forbidden.' });
        res.json(updated);
    } catch (err) {
        console.error('Mark notification read error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get unread count for a user
app.get('/api/notifications/unreadCount/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.userId !== userId) return res.status(403).json({ message: 'Forbidden.' });
        const count = await Notification.countDocuments({ userId, read: false });
        res.json({ count });
    } catch (err) {
        console.error('Unread count error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Seed sample notifications for authenticated user (development only)
app.post('/api/notifications/seed', authenticateToken, async (req, res) => {
    try {
        if (process.env.NODE_ENV === 'production') return res.status(403).json({ message: 'Not allowed in production.' });
        const userId = req.user.userId;
        const samples = [
            { userId, title: 'Welcome!', message: 'Thanks for joining Alumni Connect.', link: '/news.html' },
            { userId, title: 'New Mentorship Request', message: 'A student has requested mentorship.', link: '/manage-mentorship.html' },
            { userId, title: 'Event: Career Fair', message: 'Sign up for the upcoming career fair.', link: '/events.html' }
        ];
        const created = await Notification.insertMany(samples);
        res.json(created);
    } catch (err) {
        console.error('Seed notifications error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Connections model defined above to support mentorship acceptance logic

// Student sends connection request to an alumni
app.post('/api/connections/request', authenticateToken, async (req, res) => {
    try {
        const requesterId = req.user && req.user.userId;
        const { alumniId } = req.body;

        console.log(`Connection request incoming: requester=${requesterId}, alumniId=${alumniId}`);

        if (!alumniId || !mongoose.Types.ObjectId.isValid(alumniId)) return res.status(400).json({ message: 'Valid alumniId is required.' });
        if (!requesterId) return res.status(401).json({ message: 'Authentication required.' });
        if (requesterId === alumniId) return res.status(400).json({ message: 'Cannot connect with yourself.' });

        // Prevent duplicate pending or accepted
        const existing = await Connection.findOne({ requesterId, recipientId: alumniId, status: { $in: ['Pending','Accepted'] } });
        if (existing) {
            console.log('Connection request aborted - existing connection found:', { existingId: existing._id, status: existing.status });
            return res.status(409).json({ message: 'Connection already pending or exists.' });
        }

        const conn = new Connection({ requesterId, recipientId: alumniId });
        await conn.save();

        // Notify the alumni
        try {
            const requester = await User.findById(requesterId).select('fullName');
            const notif = new Notification({ userId: alumniId, title: 'New Connection Request', message: `${requester.fullName} sent you a connection request.`, link: `/user-profile.html?userId=${requesterId}` });
            await notif.save();
        } catch (e) { console.error('Notify alumni failed', e); }

        res.status(201).json({ message: 'Connection request sent.' });
    } catch (err) {
        console.error('Connection request error:', {
            message: err.message,
            stack: err.stack,
            body: req.body
        });
        // Handle duplicate key error explicitly (index uniqueness)
        if (err.name === 'MongoServerError' && err.code === 11000) {
            return res.status(409).json({ message: 'Connection already exists (duplicate key).' });
        }
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get pending connection requests for an alumni
app.get('/api/connections/alumni/:alumniId', authenticateToken, async (req, res) => {
    try {
        const { alumniId } = req.params;
        if (req.user.userId !== alumniId) return res.status(403).json({ message: 'Forbidden.' });
        const requests = await Connection.find({ recipientId: alumniId, status: 'Pending' }).populate('requesterId', 'fullName email profileImage');
        res.json(requests);
    } catch (err) {
        console.error('Fetch connection requests error', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Accept a connection request
app.put('/api/connections/:id/accept', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: 'Invalid id.' });
        const conn = await Connection.findById(id);
        if (!conn) return res.status(404).json({ message: 'Connection not found.' });
        if (String(conn.recipientId) !== req.user.userId) return res.status(403).json({ message: 'Forbidden.' });

        conn.status = 'Accepted';
        await conn.save();

        // Add each other to connections array if not present
        await User.findByIdAndUpdate(conn.recipientId, { $addToSet: { connections: conn.requesterId } });
        await User.findByIdAndUpdate(conn.requesterId, { $addToSet: { connections: conn.recipientId } });

        // Notify requester of acceptance
        try {
            const recipient = await User.findById(conn.recipientId).select('fullName');
            const notif = new Notification({ userId: conn.requesterId, title: 'Connection Accepted', message: `${recipient.fullName} accepted your connection request.`, link: `/user-profile.html?userId=${conn.recipientId}` });
            await notif.save();
        } catch (e) { console.error('Notify requester failed', e); }

        res.json(conn);
    } catch (err) {
        console.error('Accept connection error', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get accepted connections count for a user
app.get('/api/connections/count/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(userId)) return res.status(400).json({ message: 'Invalid userId.' });
        const count = await Connection.countDocuments({ $or: [{ requesterId: userId }, { recipientId: userId }], status: 'Accepted' });
        res.json({ count });
    } catch (err) {
        console.error('Connections count error', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// =========================================================================
// POST API - Alumni Post Information Visible to Connected Students
// =========================================================================

// Create a new post (Alumni only)
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { title, content, category } = req.body;
        const authorId = req.user.userId;

        // Verify the user is an alumni
        const user = await User.findById(authorId);
        if (!user || user.userType !== 'alumni') {
            return res.status(403).json({ message: 'Only alumni can create posts.' });
        }

        // Validate required fields
        if (!title || !content) {
            return res.status(400).json({ message: 'Title and content are required.' });
        }

        const newPost = new Post({
            authorId,
            title: title.trim(),
            content: content.trim(),
            category: category || 'General Update'
        });

        await newPost.save();
        
        // Populate author info for response
        await newPost.populate('authorId', 'fullName profession profileImage');
        
        res.status(201).json({
            message: 'Post created successfully!',
            post: newPost
        });
    } catch (err) {
        console.error('Create post error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get all posts from connected alumni (for students)
app.get('/api/posts/connections/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        if (req.user.userId !== userId) {
            return res.status(403).json({ message: 'Forbidden.' });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ message: 'Invalid userId.' });
        }

        // Get the user's connections
        const user = await User.findById(userId).select('connections');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const connectionIds = user.connections || [];

        // Get all posts from connected alumni
        const posts = await Post.find({ authorId: { $in: connectionIds } })
            .populate('authorId', 'fullName profession profileImage')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json(posts);
    } catch (err) {
        console.error('Get connection posts error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get posts by a specific alumni (visible to connected students and the alumni themselves)
app.get('/api/posts/alumni/:alumniId', authenticateToken, async (req, res) => {
    try {
        const { alumniId } = req.params;
        const requesterId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(alumniId)) {
            return res.status(400).json({ message: 'Invalid alumniId.' });
        }

        // Check if the alumni exists
        const alumni = await User.findById(alumniId);
        if (!alumni || alumni.userType !== 'alumni') {
            return res.status(404).json({ message: 'Alumni not found.' });
        }

        // Check if requester is the alumni themselves or a connected student
        if (String(alumniId) !== requesterId) {
            // Verify connection exists
            const connection = await Connection.findOne({
                $or: [
                    { requesterId: requesterId, recipientId: alumniId },
                    { requesterId: alumniId, recipientId: requesterId }
                ],
                status: 'Accepted'
            });

            if (!connection) {
                return res.status(403).json({ message: 'You are not connected to this alumni.' });
            }
        }

        const posts = await Post.find({ authorId: alumniId })
            .populate('authorId', 'fullName profession profileImage')
            .sort({ createdAt: -1 })
            .limit(100);

        res.json(posts);
    } catch (err) {
        console.error('Get alumni posts error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get a single post by ID
app.get('/api/posts/:postId', authenticateToken, async (req, res) => {
    try {
        const { postId } = req.params;
        const requesterId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: 'Invalid postId.' });
        }

        const post = await Post.findById(postId).populate('authorId', 'fullName profession profileImage');
        if (!post) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        // Verify access: only the author or connected students can view
        if (String(post.authorId._id) !== requesterId) {
            const connection = await Connection.findOne({
                $or: [
                    { requesterId: requesterId, recipientId: post.authorId._id },
                    { requesterId: post.authorId._id, recipientId: requesterId }
                ],
                status: 'Accepted'
            });

            if (!connection) {
                return res.status(403).json({ message: 'You do not have access to this post.' });
            }
        }

        res.json(post);
    } catch (err) {
        console.error('Get single post error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Delete a post (Author only)
app.delete('/api/posts/:postId', authenticateToken, async (req, res) => {
    try {
        const { postId } = req.params;
        const authorId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return res.status(400).json({ message: 'Invalid postId.' });
        }

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ message: 'Post not found.' });
        }

        // Verify the requester is the author
        if (String(post.authorId) !== authorId) {
            return res.status(403).json({ message: 'You can only delete your own posts.' });
        }

        await Post.findByIdAndDelete(postId);

        res.json({ message: 'Post deleted successfully!' });
    } catch (err) {
        console.error('Delete post error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// =========================================================================
// MESSAGING API ENDPOINTS
// =========================================================================

// Send a message
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { conversationId, to, text } = req.body;
        const from = req.user.userId;
        console.log('POST /api/messages', { from, to, conversationId, text });

        // Validate required fields
        if (!conversationId || !to || !text) {
            console.warn('Send message missing fields', req.body);
            return res.status(400).json({ message: 'conversationId, to, and text are required.' });
        }

        // Validate ObjectIds
        if (!mongoose.Types.ObjectId.isValid(to)) {
            console.warn('Invalid recipient ID', to);
            return res.status(400).json({ message: 'Invalid recipient ID.' });
        }

        // Create and save the message
        const newMessage = new Message({
            conversationId,
            from,
            to,
            text: text.trim()
        });

        await newMessage.save();

        // Populate sender info for response
        await newMessage.populate('from', 'fullName profileImage');

        // broadcast to room for real-time delivery
        try {
            io.to(conversationId).emit('newMessage', newMessage);
        } catch (e) {
            console.error('Emit newMessage failed', e);
        }

        // create notification for recipient so they see it in dashboard
        try {
            const sender = await User.findById(from).select('fullName');
            const notif = new Notification({
                userId: to,
                title: 'New Message',
                message: `${sender ? sender.fullName : 'Someone'} sent you a message.`,
                link: `/chat.html?userId=${from}`
            });
            await notif.save();
            // also emit to recipient's personal room so if connected we can show notification real-time
            io.to(to).emit('newNotification', notif);
        } catch (e) {
            console.error('Create message notification failed', e);
        }

        res.status(201).json(newMessage);
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get messages for a conversation
// filter out any messages the requesting user has deleted for themselves
app.get('/api/messages/:conversationId', authenticateToken, async (req, res) => {
    try {
        const { conversationId } = req.params;

        // Fetch messages from database, excluding those deleted for this user
        const messages = await Message.find({ 
            conversationId,
            deletedFor: { $ne: req.user.userId }
        })
            .populate('from', 'fullName profileImage')
            .populate('to', 'fullName profileImage')
            .sort({ createdAt: 1 })
            .limit(100);

        res.json(messages);
    } catch (err) {
        console.error('Get messages error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Get all conversations for a user (unique conversation partners)
// note: we don't filter deletedFor here because the summary list is built from messages,
// but individual conversations will skip deleted messages when fetched above.
app.get('/api/conversations/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;

        // Verify user is authenticated and asking for their own conversations
        if (req.user.userId !== userId) {
            return res.status(403).json({ message: 'Forbidden.' });
        }

        // Find all conversations involving this user
        const conversations = await Message.find({
            $or: [
                { from: userId },
                { to: userId }
            ]
        })
        .populate('from', 'fullName profileImage userType')
        .populate('to', 'fullName profileImage userType')
        .sort({ createdAt: -1 })
        .limit(50);

        // Get unique conversation partners with last message
        const uniqueConversations = [];
        const seenUsers = new Set();

        conversations.forEach(msg => {
            const partnerId = String(msg.from._id) === userId ? msg.to._id : msg.from._id;
            const partnerIdStr = String(partnerId);

            if (!seenUsers.has(partnerIdStr)) {
                seenUsers.add(partnerIdStr);
                const partner = String(msg.from._id) === userId ? msg.to : msg.from;
                uniqueConversations.push({
                    partnerId,
                    partnerName: partner.fullName,
                    partnerImage: partner.profileImage,                    partnerType: partner.userType,                    lastMessage: msg.text,
                    lastMessageTime: msg.createdAt,
                    conversationId: msg.conversationId
                });
            }
        });

        res.json(uniqueConversations);
    } catch (err) {
        console.error('Get conversations error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Delete a message (for me or for everyone)
// query param ?scope=me|everyone (default me)
app.delete('/api/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const scope = req.query.scope || 'me';
        const userId = req.user.userId;

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: 'Invalid messageId.' });
        }

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({ message: 'Message not found.' });
        }

        if (scope === 'everyone') {
            // only sender can delete for everyone
            if (String(message.from) !== userId) {
                return res.status(403).json({ message: 'You can only delete your own messages for everyone.' });
            }
            await Message.findByIdAndDelete(messageId);
            // notify other party(s) so UI can remove the message
            try {
                io.to(message.conversationId).emit('messageDeleted', { messageId, conversationId: message.conversationId });
            } catch (e) {
                console.error('Emit messageDeleted failed', e);
            }
            return res.json({ message: 'Message deleted for everyone.' });
        } else {
            // delete for me: add to deletedFor array if not already present
            if (!message.deletedFor) message.deletedFor = [];
            if (!message.deletedFor.map(String).includes(String(userId))) {
                message.deletedFor.push(userId);
                await message.save();
            }
            return res.json({ message: 'Message deleted for you.' });
        }
    } catch (err) {
        console.error('Delete message error:', err);
        res.status(500).json({ message: 'Server error.' });
    }
});

// Global error handler - catches any unhandled errors and returns JSON
app.use((err, req, res, next) => {
    console.error('Global error handler:', err);
    res.status(err.status || 500).json({ 
        message: err.message || 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

const preferredPort = parseInt(process.env.PORT, 10) || 4000;
let currentPort = preferredPort;
let listenAttempts = 0;
const MAX_LISTEN_ATTEMPTS = 10;

function startListening(port) {
    server.listen(port, () => console.log(`Server is running on port ${port}`));
}

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        listenAttempts += 1;
        if (listenAttempts > MAX_LISTEN_ATTEMPTS) {
            console.error(`Could not bind to a free port starting at ${preferredPort} after ${MAX_LISTEN_ATTEMPTS} attempts.`);
            process.exit(1);
        }
        console.warn(`Port ${currentPort} is in use, trying ${currentPort + 1}...`);
        currentPort += 1;
        // Try the next port after a short delay
        setTimeout(() => startListening(currentPort), 500);
        return;
    }

    // For other errors, log and exit
    console.error('Server error:', err);
    process.exit(1);
});

startListening(currentPort);