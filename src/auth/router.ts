// @ts-nocheck
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

export const users: User[] = [
  { id: 1, username: 'student', password: 'password', role: 'student' },
  { id: 2, username: 'teacher', password: 'password', role: 'teacher' },
  { id: 3, username: 'guardian', password: 'password', role: 'guardian' },
];

const router = Router();
const secret = process.env.JWT_SECRET || 'secret';

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: '1h' });
  res.cookie('token', token, { httpOnly: true });
  res.json({ token });
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

export const authRouter = router;
