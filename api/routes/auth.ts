import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getDatabase } from '../database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Extend Express Request interface via module augmentation
declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: number; username: string };
  }
}

// Login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM admin_users WHERE username = ?');
    const user = stmt.get(username) as { id: number; username: string; password: string } | undefined;

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Middleware to verify JWT token
export function authenticateToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: number; username: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Get current user info
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

// Logout (optional, since JWT is stateless)
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;