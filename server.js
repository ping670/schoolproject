import express from 'express';
import { register, login, getProfile, updateProfile } from './controllers/auth.js';
import { createEvent, getEvents, getEventById, updateEvent, publishEvent, cancelEvent } from './controllers/events.js';
import { registerForEvent, cancelRegistration, getRegistrationsMe, getEventRegistrationsOrganizer, getEventWaitlistOrganizer } from './controllers/registrations.js';
import { authenticateToken, requireRole } from './middlewares/auth.js';
import { query } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 5000;

app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.status(200).json({ status: 'healthy', database: 'connected', timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', database: 'disconnected', error: error.message });
  }
});

app.get('/ready', async (req, res) => {
  try {
    await query('SELECT 1');
    res.status(200).send('Ready');
  } catch (error) {
    res.status(503).send('Database connection failed');
  }
});

app.post('/register', register);
app.post('/login', login);

app.get('/users/me', authenticateToken, getProfile);
app.put('/users/me', authenticateToken, updateProfile);

app.post('/events', authenticateToken, requireRole('organiser'), createEvent);
app.get('/events', authenticateToken, getEvents);
app.get('/events/:id', authenticateToken, getEventById);
app.put('/events/:id', authenticateToken, requireRole('organiser'), updateEvent);
app.post('/events/:id/publish', authenticateToken, requireRole('organiser'), publishEvent);
app.post('/events/:id/cancel', authenticateToken, requireRole('organiser'), cancelEvent);

app.post('/events/:id/registrations', authenticateToken, requireRole('student'), registerForEvent);
app.delete('/registrations/:id', authenticateToken, requireRole('student'), cancelRegistration);
app.get('/registrations/me', authenticateToken, requireRole('student'), getRegistrationsMe);
app.get('/events/:id/registrations', authenticateToken, requireRole('organiser'), getEventRegistrationsOrganizer);
app.get('/events/:id/waitlist', authenticateToken, requireRole('organiser'), getEventWaitlistOrganizer);

app.use((err, req, res, next) => {
  console.error('Непредвидена грешка в сървъра:', err.stack);
  res.status(500).json({ error: 'Възникна системна сървърна грешка. Моля, опитайте отново по-късно.' });
});

app.listen(PORT, () => {
  console.log(`--------------------------------------------------`);
  console.log(`REST API сървърът работи на: http://localhost:${PORT}`);
  console.log(`--------------------------------------------------`);
});
