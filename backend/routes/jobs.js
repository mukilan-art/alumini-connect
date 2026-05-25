const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Job Schema
const jobSchema = new mongoose.Schema({
    title: String,
    company: String,
    domain: String,
    category: { type: String, enum: ['Job Vacancy', 'Internship', 'Workshop / Event', 'Career Opportunity', 'Other'], default: 'Job Vacancy' },
    location: String,
    type: String,
    eventDate: Date,
    description: String,
    applyLink: String,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to the Alumni
    createdAt: { type: Date, default: Date.now }
});

const Job = mongoose.model('Job', jobSchema);

// API Route to fetch all jobs
router.get('/jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 }).populate('postedBy', 'fullName profession companyName');
        res.json(jobs);
    } catch (err) {
        console.error('Error fetching jobs:', err);
        res.status(500).json({ message: 'Error fetching jobs.' });
    }
});

// API Route to Post a Job
router.post('/jobs', async (req, res) => {
    try {
        const { title, company, domain, category, location, type, eventDate, description, applyLink, userId } = req.body;
        const jobPayload = {
            title,
            company,
            domain,
            category: category || 'Job Vacancy',
            location,
            type,
            description,
            applyLink,
            postedBy: userId
        };

        if (eventDate) {
            const dateValue = new Date(eventDate);
            if (!isNaN(dateValue.getTime())) {
                jobPayload.eventDate = dateValue;
            }
        }

        const newJob = new Job(jobPayload);
        await newJob.save();

        // Create notifications for all students (non-blocking but we will attempt it)
        try {
            const User = mongoose.model('User');
            const Notification = mongoose.model('Notification');
            const students = await User.find({ userType: 'student' }).select('_id');
            if (students && students.length > 0) {
                const notifs = students.map(s => ({
                    userId: s._id,
                    title: `New job: ${title}`,
                    message: `${company} posted "${title}". Check opportunities.`,
                    link: '/view-jobs.html',
                    read: false
                }));
                await Notification.insertMany(notifs);
            }
        } catch (notifErr) {
            console.error('Failed to create job notifications:', notifErr);
            // Do not fail the job posting request if notification creation fails
        }

        res.status(201).json({ message: 'Job posted successfully!' });
    } catch (err) {
        console.error('Error posting job:', err);
        res.status(500).json({ message: 'Error posting job' });
    }
});

module.exports = { router };