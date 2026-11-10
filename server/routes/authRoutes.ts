import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { generateToken, authenticate, AuthRequest } from '../auth';
import {
  generateSecureResetToken,
  buildPasswordResetUrl,
  sendPasswordResetEmail,
  sanitizeSmtpErrorForLogging,
} from '../emailService';

const router = Router();

// Dedicated rate limiter for password reset endpoints (protects against brute-force & enumeration abuse)
const resetRateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function clearPasswordResetRateLimitsForTesting(): void {
  resetRateLimitStore.clear();
}

function createResetRateLimiter(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const key = `${req.path}:${ip}`;
    const now = Date.now();
    const record = resetRateLimitStore.get(key);
    if (!record || now >= record.resetAt) {
      resetRateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    record.count += 1;
    if (record.count > maxRequests) {
      res.status(429).json({
        error:
          'Prea multe solicitări de resetare a parolei. Te rugăm să aștepți câteva minute înainte de a încerca din nou.',
      });
      return;
    }
    next();
  };
}

const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'Dacă adresa de email este asociată unui cont înregistrat, am trimis instrucțiunile pentru resetarea parolei.';

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username: rawUsername, email: rawEmail, password, confirmPassword } = req.body;
    const username = typeof rawUsername === 'string' ? rawUsername.trim() : '';
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (typeof password !== 'string' || !username || !email || !password) {
      res.status(400).json({ error: 'Toate câmpurile sunt obligatorii.' });
      return;
    }

    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Parolele nu coincid.' });
      return;
    }

    if (password.length < 10 || password.length > 128) {
      res.status(400).json({ error: 'Parola trebuie să aibă între 10 și 128 de caractere.' });
      return;
    }

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Adresa de email nu este validă.' });
      return;
    }

    if (!/^[a-zA-Z0-9_ăâîșțĂÂÎȘȚ-]{3,20}$/.test(username)) {
      res
        .status(400)
        .json({ error: 'Numele de utilizator trebuie să aibă între 3 și 20 de caractere.' });
      return;
    }

    if (db.findUserByUsername(username)) {
      res.status(400).json({ error: 'Acest nume de utilizator este deja folosit.' });
      return;
    }

    if (db.findUserByEmail(email)) {
      res.status(400).json({ error: 'Acest email este deja înregistrat.' });
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);
    const id = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    const newUser = {
      id,
      username,
      email,
      passwordHash,
      role: 'user' as const,
      tokenVersion: 1,
      createdAt: nowIso,
      profile: {
        id,
        username,
        email,
        role: 'user' as const,
        avatar: 'av_vlad',
        frame: 'fr_gold',
        title: 'Jucător',
        rating: 1200,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        territoriesConquered: 0,
        correctAnswersTotal: 0,
        highestScore: 0,
        createdAt: nowIso,
      },
    };

    const created = await db.createUser(newUser);
    const token = generateToken(created.id, created.role, created.tokenVersion);

    res.json({
      token,
      user: created.profile,
    });
  } catch (err) {
    console.error('[Auth Register Error]:', err instanceof Error ? err.message : err);
    res
      .status(500)
      .json({ error: 'Eroare la salvarea contului în baza de date. Te rugăm să reîncerci.' });
  }
});

router.post('/login', (req: Request, res: Response): void => {
  const { loginIdentifier, password } = req.body;

  if (
    typeof loginIdentifier !== 'string' ||
    typeof password !== 'string' ||
    !loginIdentifier.trim() ||
    !password ||
    loginIdentifier.length > 254 ||
    password.length > 128
  ) {
    res.status(400).json({ error: 'Introduceți utilizatorul/emailul și parola.' });
    return;
  }

  const user = db.findUserByUsername(loginIdentifier) || db.findUserByEmail(loginIdentifier);

  if (!user) {
    res.status(401).json({ error: 'Date de autentificare incorecte.' });
    return;
  }

  if (user.isBanned) {
    res.status(403).json({ error: 'Acest cont a fost suspendat de către administrator.' });
    return;
  }

  const isMatch = bcrypt.compareSync(password, user.passwordHash);
  if (!isMatch) {
    res.status(401).json({ error: 'Date de autentificare incorecte.' });
    return;
  }

  const token = generateToken(user.id, user.role, user.tokenVersion);
  res.json({
    token,
    user: user.profile,
  });
});

router.post('/guest', async (_req: Request, res: Response): Promise<void> => {
  try {
    const GUEST_NAMES = [
      'Cavalerul_Carpatin',
      'Voinicul_Radu',
      'Haiducul_Codrilor',
      'Arcasul_Stefan',
      'Razesul_Moldovean',
      'Banul_Oltean',
      'Pribeagul_Transilvan',
      'Capitanul_Dunarean',
    ];
    const randomName = `${GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)]}_${Math.floor(
      100 + Math.random() * 900
    )}`;
    const id = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nowIso = new Date().toISOString();

    const guestUser = {
      id,
      username: randomName,
      email: `${randomName.toLowerCase()}@guest.conquiz.ro`,
      passwordHash: '',
      role: 'user' as const,
      tokenVersion: 1,
      createdAt: nowIso,
      profile: {
        id,
        username: randomName,
        email: `${randomName.toLowerCase()}@guest.conquiz.ro`,
        role: 'user' as const,
        avatar: 'av_razes',
        frame: 'fr_gold',
        title: 'Oaspete',
        rating: 1200,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        territoriesConquered: 0,
        correctAnswersTotal: 0,
        highestScore: 0,
        createdAt: nowIso,
      },
    };

    const created = await db.createUser(guestUser);
    const token = generateToken(created.id, created.role, created.tokenVersion);
    res.json({
      token,
      user: created.profile,
    });
  } catch (err) {
    console.error('[Auth Guest Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la crearea sesiunii de oaspete în baza de date.' });
  }
});

// Solicita resetarea parolei prin email (răspuns identic pentru adrese existente și inexistente)
router.post(
  '/forgot-password',
  createResetRateLimiter(5, 15 * 60 * 1000),
  async (req: Request, res: Response): Promise<void> => {
    const rawEmail = req.body?.email;
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';

    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Te rugăm să introduci o adresă de email validă.' });
      return;
    }

    const user = db.findUserByEmail(email);

    // Pentru conturi inexistente, conturi de oaspete sau suspendate returnăm același mesaj general
    if (!user || !user.passwordHash || user.email.endsWith('@guest.conquiz.ro') || user.isBanned) {
      res.status(200).json({
        success: true,
        message: GENERIC_FORGOT_PASSWORD_MESSAGE,
      });
      return;
    }

    const expiresInMinutes = Math.max(
      5,
      Math.min(120, Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES) || 30)
    );
    const expiresInMs = expiresInMinutes * 60 * 1000;
    const rawToken = generateSecureResetToken();

    let tokenRecordId: string | null = null;
    try {
      const resetUrl = buildPasswordResetUrl(rawToken, process.env);
      const tokenRecord = await db.createPasswordResetToken(user.id, rawToken, expiresInMs);
      tokenRecordId = tokenRecord.id;

      await sendPasswordResetEmail(
        {
          toEmail: user.email,
          username: user.username,
          resetUrl,
          expiresInMinutes,
        },
        process.env
      );
    } catch (err) {
      // Dacă trimiterea emailului eșuează, invalidăm tokenul creat și înregistrăm o eroare sigură (fără token/email)
      if (tokenRecordId) {
        try {
          await db.invalidatePasswordResetTokenById(tokenRecordId);
        } catch {
          // ignore secondary cleanup error
        }
      }
      console.error(
        `[SMTP Password Reset Error]: Trimiterea emailului de resetare a eșuat (${sanitizeSmtpErrorForLogging(
          err
        )}).`
      );
    }

    res.status(200).json({
      success: true,
      message: GENERIC_FORGOT_PASSWORD_MESSAGE,
    });
  }
);

// Confirmă resetarea parolei pe baza tokenului de unică folosință
router.post(
  '/reset-password',
  createResetRateLimiter(10, 15 * 60 * 1000),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token: rawToken, newPassword, confirmPassword } = req.body || {};
      const token = typeof rawToken === 'string' ? rawToken.trim() : '';

      if (!token || token.length < 32 || token.length > 256) {
        res.status(400).json({ error: 'Tokenul de resetare este invalid sau expirat.' });
        return;
      }

      if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) {
        res
          .status(400)
          .json({ error: 'Noua parolă trebuie să aibă între 10 și 128 de caractere.' });
        return;
      }

      if (confirmPassword !== undefined && newPassword !== confirmPassword) {
        res.status(400).json({ error: 'Parolele introduse nu coincid.' });
        return;
      }

      const result = await db.consumePasswordResetToken(token, newPassword);
      if (!result.success) {
        res.status(400).json({
          error:
            result.reason === 'expired'
              ? 'Tokenul de resetare a expirat. Solicită un nou link de resetare.'
              : 'Tokenul de resetare este invalid sau a fost deja utilizat.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Parola a fost resetată cu succes! Te poți autentifica acum cu noua parolă.',
      });
    } catch (err) {
      console.error('[Auth Reset Password Error]:', err instanceof Error ? err.message : err);
      res.status(500).json({
        error: 'Eroare la actualizarea parolei în baza de date. Nicio modificare nu a fost aplicată.',
      });
    }
  }
);

router.get('/me', authenticate, (req: AuthRequest, res: Response): void => {
  const user = db.findUserById(req.userId!);
  if (!user) {
    res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
    return;
  }
  const notifs = db.getNotifications(req.userId!);
  const unreadNotifs = notifs.filter((n) => !n.isRead).length;

  res.json({
    user: user.profile,
    unreadNotificationsCount: unreadNotifs,
  });
});

router.put('/profile', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, avatar, frame, title } = req.body;
    const user = db.findUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
      return;
    }

    if (username && username !== user.username) {
      if (!/^[a-zA-Z0-9_ăâîșțĂÂÎȘȚ-]{3,20}$/.test(username)) {
        res.status(400).json({ error: 'Numele trebuie să conțină între 3 și 20 de caractere.' });
        return;
      }
      const existing = db.findUserByUsername(username);
      if (existing && existing.id !== user.id) {
        res.status(400).json({ error: 'Acest nume este deja ocupat de alt jucător.' });
        return;
      }
    }

    const updated = await db.updateUserProfile(user.id, {
      ...(username ? { username } : {}),
      ...(avatar ? { avatar } : {}),
      ...(frame ? { frame } : {}),
      ...(title ? { title } : {}),
    });

    res.json({ user: updated });
  } catch (err) {
    console.error('[Auth Profile Update Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Nu s-a putut actualiza profilul în baza de date.' });
  }
});

router.put('/password', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = db.findUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: 'Utilizatorul nu a fost găsit.' });
      return;
    }

    if (!user.passwordHash) {
      res.status(400).json({
        error:
          'Conturile de oaspete nu au o parolă de schimbat. Creează un cont cu email și parolă.',
      });
      return;
    }

    if (
      typeof currentPassword !== 'string' ||
      !bcrypt.compareSync(currentPassword, user.passwordHash)
    ) {
      res.status(400).json({ error: 'Parola actuală este incorectă.' });
      return;
    }

    if (typeof newPassword !== 'string' || newPassword.length < 10 || newPassword.length > 128) {
      res
        .status(400)
        .json({ error: 'Noua parolă trebuie să aibă între 10 și 128 de caractere.' });
      return;
    }

    const salt = bcrypt.genSaltSync(10);
    const newHash = bcrypt.hashSync(newPassword, salt);
    const updatedUser = await db.updateUserPassword(user.id, newHash);
    const freshToken = updatedUser
      ? generateToken(updatedUser.id, updatedUser.role, updatedUser.tokenVersion)
      : undefined;

    res.json({
      success: true,
      token: freshToken,
      message: 'Parola a fost schimbată cu succes!',
    });
  } catch (err) {
    console.error('[Auth Password Update Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la salvarea noii parole în baza de date.' });
  }
});

export default router;
