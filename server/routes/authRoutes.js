import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { signAdminToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signAdminToken(admin);
  res.json({ token, email: admin.email });
});

export default router;
