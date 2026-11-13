import { Router, Request, Response } from 'express';
import { db } from '../db';
import { verifyAuthToken } from '../auth';
import { FeedbackCategory } from '../../src/types/game';

const router = Router();

const VALID_CATEGORIES: FeedbackCategory[] = [
  'problema_tehnica',
  'intrebare_gresita',
  'idee_imbunatatire',
  'altceva',
];

// Rate limiting / duplicate submission guard per user or IP
const recentFeedbackByActor = new Map<string, { lastMessage: string; lastSentAt: number }>();

export function clearFeedbackRateLimitsForTesting(): void {
  recentFeedbackByActor.clear();
}

function sanitizeFeedbackMessage(raw: string): string {
  // Scrub any accidental bearer tokens or password-like strings from feedback text
  return raw
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, '[TOKEN_OMIS]')
    .replace(/(password|parola|secret|token)\s*[:=]\s*\S+/gi, '$1=[OMIS]')
    .trim();
}

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, message, roomId } = req.body || {};

    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: 'Selectează o categorie validă pentru feedback.',
      });
      return;
    }

    const cleanMessage = sanitizeFeedbackMessage(String(message || ''));
    if (cleanMessage.length < 5 || cleanMessage.length > 1500) {
      res.status(400).json({
        error: 'Mesajul de feedback trebuie să aibă între 5 și 1500 de caractere.',
      });
      return;
    }

    // Extract optional authenticated user from Authorization header without requiring login
    let userId: string | null = null;
    let username = 'Vizitator';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAuthToken(token);
      if (decoded?.userId) {
        const userRec = db.findUserById(decoded.userId);
        if (userRec && !userRec.isBanned) {
          userId = userRec.id;
          username = userRec.username;
        }
      }
    }

    const ip =
      (req.headers['x-real-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const actorKey = userId || `ip:${ip}`;
    const now = Date.now();
    const prev = recentFeedbackByActor.get(actorKey);

    if (prev) {
      if (prev.lastMessage.toLowerCase() === cleanMessage.toLowerCase() && now - prev.lastSentAt < 60_000) {
        res.status(429).json({
          error: 'Ai trimis deja acest mesaj de feedback recent.',
        });
        return;
      }
      if (now - prev.lastSentAt < 5_000) {
        res.status(429).json({
          error: 'Te rugăm să aștepți câteva secunde înainte de a trimite un alt feedback.',
        });
        return;
      }
    }

    recentFeedbackByActor.set(actorKey, { lastMessage: cleanMessage, lastSentAt: now });

    const created = await db.createFeedback({
      userId,
      username,
      category,
      message: cleanMessage,
      roomId:
        typeof roomId === 'string' && roomId.trim()
          ? roomId.trim().toUpperCase().slice(0, 20)
          : null,
    });

    res.status(201).json({
      success: true,
      feedback: created,
      message: 'Mulțumim! Feedback-ul tău a fost înregistrat și va fi verificat de echipa CONQUIZ.',
    });
  } catch (err) {
    console.error('[Feedback Submit Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la salvarea feedback-ului.' });
  }
});

export default router;

