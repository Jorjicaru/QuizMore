import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { Question, GameState } from '../src/types/game';
import { UserRecord, GameRecord, FriendRecord, NotificationRecord } from './db';
import { normalizeQuestionText } from './questionsData';

let pool: Pool | null = null;
let postgresReady = false;

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

export function getPostgresPool(): Pool | null {
  if (!isPostgresConfigured()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    pool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]:', err.message);
    });
  }
  return pool;
}

export async function initPostgresSchema(): Promise<boolean> {
  const pgPool = getPostgresPool();
  if (!pgPool) return false;
  try {
    const migrationPath = path.resolve(process.cwd(), 'db', 'migrations', '001_init.sql');
    if (fs.existsSync(migrationPath)) {
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      await pgPool.query(sql);
    }
    postgresReady = true;
    return true;
  } catch (err: any) {
    console.error('[PostgreSQL Init Error]:', err.message);
    postgresReady = false;
    return false;
  }
}

export async function checkPostgresHealth(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const pgPool = getPostgresPool();
  if (!pgPool) return { connected: false, error: 'DATABASE_URL not configured' };
  const start = Date.now();
  try {
    await pgPool.query('SELECT 1');
    postgresReady = true;
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    postgresReady = false;
    return { connected: false, error: err.message };
  }
}

export function isPostgresReady(): boolean {
  return postgresReady;
}

export async function upsertUserToPostgres(user: UserRecord): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    const p = user.profile;
    await pgPool.query(
      `INSERT INTO users (
        id, username, email, password_hash, role, is_banned,
        avatar, title, rating, matches_played, wins, losses,
        territories_conquered, correct_answers_total, highest_score, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
      ON CONFLICT (id) DO UPDATE SET
        username = EXCLUDED.username,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        is_banned = EXCLUDED.is_banned,
        avatar = EXCLUDED.avatar,
        title = EXCLUDED.title,
        rating = EXCLUDED.rating,
        matches_played = EXCLUDED.matches_played,
        wins = EXCLUDED.wins,
        losses = EXCLUDED.losses,
        territories_conquered = EXCLUDED.territories_conquered,
        correct_answers_total = EXCLUDED.correct_answers_total,
        highest_score = EXCLUDED.highest_score,
        updated_at = NOW()`,
      [
        user.id,
        user.username,
        user.email,
        user.passwordHash,
        user.role,
        Boolean(user.isBanned),
        p.avatar || 'av_vlad',
        p.title || 'Răzeș',
        p.rating ?? 1200,
        p.matchesPlayed ?? 0,
        p.wins ?? 0,
        p.losses ?? 0,
        p.territoriesConquered ?? 0,
        p.correctAnswersTotal ?? 0,
        p.highestScore ?? 0,
        user.createdAt || new Date().toISOString(),
      ]
    );
  } catch (err: any) {
    console.error('[PostgreSQL upsertUser error]:', err.message);
  }
}

export async function deleteUserFromPostgres(userId: string): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    await pgPool.query('DELETE FROM users WHERE id = $1', [userId]);
  } catch (err: any) {
    console.error('[PostgreSQL deleteUser error]:', err.message);
  }
}

export async function upsertQuestionToPostgres(q: Question): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    const fp = normalizeQuestionText(q.question);
    const status = q.reviewStatus || (q.isDisabled ? 'disabled' : 'approved');
    await pgPool.query(
      `INSERT INTO questions (
        id, category, difficulty, type, question, normalized_fingerprint,
        fact_key, options_json, correct_answer_index, target_number, unit,
        explanation, source_url, source_title, source_checked_at,
        review_status, is_disabled, reported_count, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
      ON CONFLICT (id) DO UPDATE SET
        category = EXCLUDED.category,
        difficulty = EXCLUDED.difficulty,
        type = EXCLUDED.type,
        question = EXCLUDED.question,
        normalized_fingerprint = EXCLUDED.normalized_fingerprint,
        fact_key = EXCLUDED.fact_key,
        options_json = EXCLUDED.options_json,
        correct_answer_index = EXCLUDED.correct_answer_index,
        target_number = EXCLUDED.target_number,
        unit = EXCLUDED.unit,
        explanation = EXCLUDED.explanation,
        source_url = EXCLUDED.source_url,
        source_title = EXCLUDED.source_title,
        source_checked_at = EXCLUDED.source_checked_at,
        review_status = EXCLUDED.review_status,
        is_disabled = EXCLUDED.is_disabled,
        reported_count = EXCLUDED.reported_count,
        updated_at = NOW()`,
      [
        q.id,
        q.category,
        q.difficulty || 'mediu',
        q.type,
        q.question,
        fp,
        q.factKey || `fact_${q.category}_${q.id}`,
        q.options ? JSON.stringify(q.options) : null,
        q.correctAnswerIndex ?? null,
        q.targetNumber ?? null,
        q.unit ?? null,
        q.explanation || '',
        q.sourceUrl || 'https://ro.wikipedia.org/wiki/Portal:Rom%C3%A2nia',
        q.sourceTitle || 'Enciclopedia CONQUIZ',
        q.sourceCheckedAt || '2026-11-10',
        status,
        Boolean(q.isDisabled),
        q.reportedCount ?? 0,
      ]
    );
  } catch (err: any) {
    console.error('[PostgreSQL upsertQuestion error]:', err.message);
  }
}

export async function deleteQuestionFromPostgres(id: string): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    await pgPool.query('DELETE FROM questions WHERE id = $1', [id]);
  } catch (err: any) {
    console.error('[PostgreSQL deleteQuestion error]:', err.message);
  }
}

export async function insertGameToPostgres(game: GameRecord): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO games (id, room_id, created_at, duration_seconds, player_count, winner_id, winner_username, players_summary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [
        game.id,
        game.roomId,
        game.createdAt,
        game.durationSeconds,
        game.playerCount,
        game.winnerId,
        game.winnerUsername || null,
        JSON.stringify(game.playersSummary || []),
      ]
    );
    for (const p of game.playersSummary || []) {
      await pgPool.query(
        `INSERT INTO game_player_results (game_id, user_id, username, score, territories, correct_answers, is_winner, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [game.id, p.userId, p.username, p.score, p.territories, p.correctAnswers, p.isWinner, game.createdAt]
      );
    }
  } catch (err: any) {
    console.error('[PostgreSQL insertGame error]:', err.message);
  }
}

export async function upsertFriendToPostgres(f: FriendRecord): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO friends (id, requester_id, recipient_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [f.id, f.requesterId, f.recipientId, f.status, f.createdAt]
    );
  } catch (err: any) {
    console.error('[PostgreSQL upsertFriend error]:', err.message);
  }
}

export async function deleteFriendFromPostgres(id: string): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    await pgPool.query('DELETE FROM friends WHERE id = $1', [id]);
  } catch (err: any) {
    console.error('[PostgreSQL deleteFriend error]:', err.message);
  }
}

export async function upsertNotificationToPostgres(n: NotificationRecord): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    await pgPool.query(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET is_read = EXCLUDED.is_read`,
      [n.id, n.userId, n.title, n.message, n.type, n.isRead, n.createdAt]
    );
  } catch (err: any) {
    console.error('[PostgreSQL upsertNotification error]:', err.message);
  }
}

export async function saveActiveGameSnapshotsToPostgres(games: GameState[], interrupted = true): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    for (const g of games) {
      await pgPool.query(
        `INSERT INTO active_game_snapshots (room_id, phase, player_count, state_json, interrupted_by_shutdown, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (room_id) DO UPDATE SET
           phase = EXCLUDED.phase,
           player_count = EXCLUDED.player_count,
           state_json = EXCLUDED.state_json,
           interrupted_by_shutdown = EXCLUDED.interrupted_by_shutdown,
           updated_at = NOW()`,
        [g.roomId, g.phase, g.players.length, JSON.stringify(g), interrupted]
      );
    }
  } catch (err: any) {
    console.error('[PostgreSQL saveActiveGameSnapshots error]:', err.message);
  }
}

export async function closePostgresPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    postgresReady = false;
  }
}
