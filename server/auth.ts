import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db';

const developmentSecret = 'CONQUIZ-LOCAL-DEVELOPMENT-ONLY-CHANGE-ME-32-CHARS';
const configuredJwtSecret = process.env.JWT_SECRET || '';
if (process.env.NODE_ENV === 'production' && (configuredJwtSecret.length < 32 || /replace|example|change-me|inlocuieste/i.test(configuredJwtSecret))) {
  throw new Error('JWT_SECRET trebuie să fie o valoare aleatorie proprie, de minimum 32 de caractere; nu folosi placeholderul din .env.example.');
}
const JWT_SECRET = configuredJwtSecret || developmentSecret;

export interface AuthRequest extends Request {
  userId?: string;
  userRole?: 'user' | 'admin';
}

export interface VerifiedIdentity {
  userId: string;
  role: 'user' | 'admin';
  username: string;
  avatar: string;
}

export function generateToken(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '7d' });
}

/** Verifies a bearer token and resolves the current account from the database. */
export function verifyAuthToken(token: string): VerifiedIdentity | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId?: string };
    if (!decoded.userId) return null;
    const user = db.findUserById(decoded.userId);
    if (!user || user.isBanned) return null;
    return {
      userId: user.id,
      role: user.role,
      username: user.username,
      avatar: user.profile.avatar || 'av_razes',
    };
  } catch {
    return null;
  }
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Neautorizat: Lipsește tokenul de acces.' });
    return;
  }

  const identity = verifyAuthToken(authHeader.slice(7));
  if (!identity) {
    res.status(401).json({ error: 'Token invalid, expirat sau cont suspendat.' });
    return;
  }
  req.userId = identity.userId;
  req.userRole = identity.role;
  next();
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userRole !== 'admin') {
    res.status(403).json({ error: 'Acces interzis: Necesită drepturi de administrator.' });
    return;
  }
  next();
}
