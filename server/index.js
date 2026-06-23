import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import './db.js'; // initializes DB + seeds admin if configured

import authRoutes from './routes/authRoutes.js';
import customerRoutes from './routes/customerRoutes.js';
import usbRoutes from './routes/usbRoutes.js';
import bulkRoutes from './routes/bulkRoutes.js';

const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 4001;

app.use(
  cors({
    origin: process.env.LOCAL_APP_MODE === 'true' ? true : process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  })
);
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/admin/auth', authRoutes);
app.use('/admin', customerRoutes);
app.use('/admin', usbRoutes);
app.use('/admin', bulkRoutes);

// Centralized error handler — never leak secrets/internals to clients.
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`USB Fulfillment Tool server listening on http://localhost:${PORT}`);
});
