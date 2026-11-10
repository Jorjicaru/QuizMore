import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from './db';
import { isPlaceholderValue, hasSufficientEntropy, isAiStudioPreviewEnv } from './envSecurity';

const developmentSecret = 'CONQUIZ-LOCAL-DEVELOPMENT-ONLY-FALLBACK-SECRET-KEY-91';

export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = String(env.JWT_SECRET || '').trim();
  const isStrictProd =
    env.STRICT_ENV_VALIDATION === 'true' ||
    (env.NODE_ENV === 'production' && !isAiStudioPreviewEnv(env));

  if (isStrictProd) {
    if (
      configured.length < 32 ||
      isPlaceholderValue(configured) ||
      !hasSufficientEntropy(configured, 8)
    ) {
      throw new Error(
        'JWT_SECRET trebuie să fie o valoare aleatorie proprie, de minimum 32 de caractere; nu folosi placeholderul din .env.example.'
      );
    }
    return configured;
  }

  if (configured.length >= 32 && !isPlaceholderValue(configured)) {
    return configured;
  }
  return developmentSecret;
}

const JWT_SECRET = resolveJwtSecret();

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

export function generateToken(userId: string, role: string, tokenVersion?: number): string {
  const user = db.findUserById(userId);
  const resolvedVersion = tokenVersion ?? user?.tokenVersion ?? 1;
  return jwt.sign({ userId, role, tokenVersion: resolvedVersion }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

/** Verifies a bearer token and resolves the current account + tokenVersion from the database. */
export function verifyAuthToken(token: string): VerifiedIdentity | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      userId?: string;
      tokenVersion?: number;
    };
    if (!decoded.userId) return null;
    const user = db.findUserById(decoded.userId);
    if (!user || user.isBanned) return null;

    const currentTokenVersion = user.tokenVersion ?? 1;
    const decodedTokenVersion = decoded.tokenVersion ?? 1;
    if (decodedTokenVersion !== currentTokenVersion) {
      return null;
    }

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
