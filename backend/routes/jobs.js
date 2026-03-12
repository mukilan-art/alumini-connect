// Job Schema
const jobSchema = new mongoose.Schema({
    title: String,
    company: String,
    location: String,
    description: String,
    applyLink: String,
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Reference to the Alumni
    createdAt: { type: Date, default: Date.now }
});

const Job = mongoose.model('Job', jobSchema);

// API Route to Post a Job
app.post('/api/jobs', async (req, res) => {
    try {
        const { title, company, location, description, applyLink, userId } = req.body;
        const newJob = new Job({ title, company, location, description, applyLink, postedBy: userId });
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

        res.status(201).json({ message: "Job posted successfully!" });
    } catch (err) {
        res.status(500).json({ message: "Error posting job" });
    }
});