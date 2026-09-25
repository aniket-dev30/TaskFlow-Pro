const express = require('express');
const cors = require('cors');
require('dotenv').config();

const tasksRouter = require('./routes/tasks');
const dependenciesRouter = require('./routes/dependencies');
const aiRouter = require('./routes/aiSuggestions');

const app = express();
const configuredFrontendOrigin = process.env.FRONTEND_ORIGIN?.trim();
const frontendOrigin = configuredFrontendOrigin && configuredFrontendOrigin !== '*'
	? configuredFrontendOrigin
	: 'http://localhost:5173';
app.use(cors({ origin: frontendOrigin }));
app.use(express.json());

app.use('/tasks', tasksRouter);
app.use('/dependencies', dependenciesRouter);
app.use('/ai', aiRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`TaskFlow Pro backend listening on port ${PORT}`));
