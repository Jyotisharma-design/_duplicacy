// server/index.js
require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const session = require('express-session');

const { initSocket } = require('./websocket/realTimeUpdates');
const duplicateController = require('./controllers/duplicateController');
const authController = require('./controllers/authController');

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'photo-secret',
    resave: false,
    saveUninitialized: true
  })
);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Auth routes
app.get('/api/auth/url', authController.getAuthUrl);
app.get('/api/auth/callback', authController.oauthCallback);

// Entry endpoint to analyze drive link
app.post('/api/analyze', async (req, res) => {
  const { driveLink } = req.body;
  if (!driveLink) {
    return res.status(400).json({ error: 'driveLink is required' });
  }

  try {
    // Kick off analysis without blocking response
    duplicateController.startAnalysis(driveLink);
    res.json({ status: 'processing_started' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

// Serve frontend files (if built)
app.use(express.static(path.join(__dirname, '..', 'client', 'build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
});

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});