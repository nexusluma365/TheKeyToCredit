import jwt from 'jsonwebtoken';

const SECRET = process.env.ADMIN_API_SECRET;

if (!SECRET) {
  console.warn(
    '[auth] ADMIN_API_SECRET is not set. Admin routes will reject all requests until it is configured in .env'
  );
}

export function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, email: admin.email }, SECRET, { expiresIn: '12h' });
}

export function requireAdminAuth(req, res, next) {
  if (process.env.LOCAL_APP_MODE === 'true') {
    req.admin = { email: 'Local Mac App' };
    return next();
  }

  if (!SECRET) {
    return res.status(503).json({ error: 'Server is not configured. ADMIN_API_SECRET is missing.' });
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const payload = jwt.verify(token, SECRET);
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }
}
