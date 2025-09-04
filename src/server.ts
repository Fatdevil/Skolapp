// @ts-nocheck
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { authRouter } from './auth/router';
import { Role } from './models/User';

const app = express();
const secret = process.env.JWT_SECRET || 'secret';

app.use(express.json());
app.use(cookieParser());

const authenticate = (req, res, next) => {
  const token = req.cookies.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token) return res.sendStatus(401);
  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (e) {
    return res.sendStatus(401);
  }
};

const authorize = (...roles: Role[]) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.sendStatus(403);
  }
  next();
};

app.use('/auth', authRouter);

app.get('/student', authenticate, authorize('student'), (_req, res) => {
  res.json({ message: 'student content' });
});

app.get('/teacher', authenticate, authorize('teacher'), (_req, res) => {
  res.json({ message: 'teacher content' });
});

app.get('/guardian', authenticate, authorize('guardian'), (_req, res) => {
  res.json({ message: 'guardian content' });
});

export { app };

