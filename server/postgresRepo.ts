import fs from 'fs';
import path from 'path';
import { Pool, PoolClient } from 'pg';
import { Question, GameState } from '../src/types/game';
import { UserRecord, GameRecord, FriendRecord, NotificationRecord, DatabaseSchema } from './db';
import { normalizeQuestionText } from './questionsData';
import { isAiStudioPreviewEnv, isPlaceholderValue } from './envSecurity';

export interface QueryableClient {
  query(text: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }>;
  release?: () => void;
}

export interface PostgresPoolLike extends QueryableClient {
  connect(): Promise<QueryableClient>;
  end(): Promise<void>;
}

let pool: PostgresPoolLike | null = null;
let postgresReady = false;
let injectedTestPool: PostgresPoolLike | null = null;

export function setPostgresPoolForTesting(customPool: PostgresPoolLike | null): void {
  injectedTestPool = customPool;
  pool = customPool;
  postgresReady = Boolean(customPool);
}

export function isPostgresConfigured(): boolean {
  if (injectedTestPool) return true;
  // In development or Google AI Studio Preview, use local JSON fallback unless POSTGRES_ENABLED=true is explicitly set.
  if (
    (process.env.NODE_ENV !== 'production' || isAiStudioPreviewEnv(process.env)) &&
    process.env.POSTGRES_ENABLED !== 'true'
  ) {
    return false;
  }
  const dbUrl = String(process.env.DATABASE_URL || '').trim();
  if (!dbUrl || isPlaceholderValue(dbUrl)) {
    return false;
  }
  return true;
}

export function getPostgresPool(): PostgresPoolLike | null {
  if (injectedTestPool) return injectedTestPool;
  if (!isPostgresConfigured()) return null;
  if (!pool) {
    const realPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    realPool.on('error', (err) => {
      console.error('[PostgreSQL Pool Error]:', err.message);
    });
    pool = realPool as unknown as PostgresPoolLike;
  }
  return pool;
}

export async function withPostgresTransaction<T>(
  fn: (client: QueryableClient) => Promise<T>
): Promise<T | null> {
  const pgPool = getPostgresPool();
  if (!pgPool) return null;
  const client = await pgPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback error
    }
    throw err;
  } finally {
    if (client.release) client.release();
  }
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

export async function checkPostgresHealth(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
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

/**
 * Citește întreaga stare persistentă din PostgreSQL (sursa autoritativă în producție).
 */
export async function loadAllFromPostgres(): Promise<DatabaseSchema | null> {
  const pgPool = getPostgresPool();
  if (!pgPool) return null;

  const [usersRes, questionsRes, gamesRes, resultsRes, friendsRes, notifsRes] = await Promise.all([
    pgPool.query('SELECT * FROM users ORDER BY created_at ASC'),
    pgPool.query('SELECT * FROM questions ORDER BY id ASC'),
    pgPool.query('SELECT * FROM games ORDER BY created_at DESC LIMIT 200'),
    pgPool.query('SELECT * FROM game_player_results ORDER BY id ASC'),
    pgPool.query('SELECT * FROM friends ORDER BY created_at DESC'),
    pgPool.query('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 500'),
  ]);

  const users: Record<string, UserRecord> = {};
  for (const row of usersRes.rows) {
    const createdAtIso =
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    users[row.id] = {
      id: row.id,
      username: row.username,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role === 'admin' ? 'admin' : 'user',
      isBanned: Boolean(row.is_banned),
      createdAt: createdAtIso,
      profile: {
        id: row.id,
        username: row.username,
        email: row.email,
        role: row.role === 'admin' ? 'admin' : 'user',
        avatar: row.avatar || 'av_vlad',
        title: row.title || 'Răzeș',
        rating: Number(row.rating ?? 1200),
        matchesPlayed: Number(row.matches_played ?? 0),
        wins: Number(row.wins ?? 0),
        losses: Number(row.losses ?? 0),
        territoriesConquered: Number(row.territories_conquered ?? 0),
        correctAnswersTotal: Number(row.correct_answers_total ?? 0),
        highestScore: Number(row.highest_score ?? 0),
        createdAt: createdAtIso,
      },
    };
  }

  const questions: Question[] = questionsRes.rows.map((row) => {
    const reviewStatus = (row.review_status || 'draft') as Question['reviewStatus'];
    const options = Array.isArray(row.options_json)
      ? row.options_json
      : typeof row.options_json === 'string'
      ? JSON.parse(row.options_json)
      : undefined;
    const q: Question = {
      id: row.id,
      category: row.category,
      difficulty: row.difficulty || 'mediu',
      type: row.type,
      question: row.question,
      options,
      correctAnswerIndex:
        row.correct_answer_index !== null && row.correct_answer_index !== undefined
          ? Number(row.correct_answer_index)
          : undefined,
      targetNumber:
        row.target_number !== null && row.target_number !== undefined
          ? Number(row.target_number)
          : undefined,
      unit: row.unit ?? undefined,
      explanation: row.explanation || '',
      factKey: row.fact_key,
      reviewStatus,
      verified: reviewStatus === 'approved',
      sourceUrl: row.source_url || undefined,
      sourceTitle: row.source_title || undefined,
      sourceCheckedAt: row.source_checked_at || undefined,
      isDisabled: Boolean(row.is_disabled),
      reportedCount: Number(row.reported_count ?? 0),
    };
    return q;
  });

  const resultsByGameId = new Map<string, GameRecord['playersSummary']>();
  for (const r of resultsRes.rows) {
    const list = resultsByGameId.get(r.game_id) || [];
    list.push({
      userId: r.user_id,
      username: r.username,
      score: Number(r.score ?? 0),
      territories: Number(r.territories ?? 0),
      correctAnswers: Number(r.correct_answers ?? 0),
      isWinner: Boolean(r.is_winner),
    });
    resultsByGameId.set(r.game_id, list);
  }

  const games: GameRecord[] = gamesRes.rows.map((row) => {
    const createdAtIso =
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
    const relationalSummary = resultsByGameId.get(row.id);
    const jsonSummary = Array.isArray(row.players_summary)
      ? row.players_summary
      : typeof row.players_summary === 'string'
      ? JSON.parse(row.players_summary)
      : [];
    return {
      id: row.id,
      roomId: row.room_id,
      createdAt: createdAtIso,
      durationSeconds: Number(row.duration_seconds ?? 0),
      playerCount: Number(row.player_count ?? 0),
      winnerId: row.winner_id || null,
      winnerUsername: row.winner_username || undefined,
      playersSummary:
        relationalSummary && relationalSummary.length > 0 ? relationalSummary : jsonSummary,
    };
  });

  const friends: FriendRecord[] = friendsRes.rows.map((row) => ({
    id: row.id,
    requesterId: row.requester_id,
    recipientId: row.recipient_id,
    status: row.status === 'accepted' ? 'accepted' : 'pending',
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));

  const notifications: NotificationRecord[] = notifsRes.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    message: row.message,
    type: row.type,
    isRead: Boolean(row.is_read),
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  }));

  return {
    users,
    questions,
    games,
    friends,
    notifications,
  };
}

export async function upsertUserToPostgres(
  user: UserRecord,
  client?: QueryableClient
): Promise<void> {
  const executor = client || getPostgresPool();
  if (!executor) return;
  try {
    const p = user.profile;
    await executor.query(
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
    if (client) throw err;
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

export async function upsertQuestionToPostgres(
  q: Question,
  client?: QueryableClient
): Promise<void> {
  const executor = client || getPostgresPool();
  if (!executor) return;
  try {
    const fp = normalizeQuestionText(q.question);
    // V9.1: reviewStatus defaults to 'draft', never automatically 'approved'
    const status = q.reviewStatus || (q.isDisabled ? 'disabled' : 'draft');
    await executor.query(
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
        q.sourceUrl ?? null,
        q.sourceTitle ?? null,
        q.sourceCheckedAt ?? null,
        status,
        Boolean(q.isDisabled),
        q.reportedCount ?? 0,
      ]
    );
  } catch (err: any) {
    console.error('[PostgreSQL upsertQuestion error]:', err.message);
    if (client) throw err;
  }
}

export async function seedQuestionsBatchToPostgres(questions: Question[]): Promise<void> {
  if (!questions.length) return;
  await withPostgresTransaction(async (client) => {
    for (const q of questions) {
      await upsertQuestionToPostgres(q, client);
    }
  });
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

/**
 * Salvează un meci și rezultatele jucătorilor într-o tranzacție SQL atomică și idempotentă.
 * Folosește ON CONFLICT (game_id, user_id) DO UPDATE pe game_player_results.
 */
export async function insertGameToPostgres(game: GameRecord): Promise<void> {
  if (!isPostgresConfigured()) return;
  try {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `INSERT INTO games (id, room_id, created_at, duration_seconds, player_count, winner_id, winner_username, players_summary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET
           room_id = EXCLUDED.room_id,
           duration_seconds = EXCLUDED.duration_seconds,
           player_count = EXCLUDED.player_count,
           winner_id = EXCLUDED.winner_id,
           winner_username = EXCLUDED.winner_username,
           players_summary = EXCLUDED.players_summary`,
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
        await client.query(
          `INSERT INTO game_player_results (game_id, user_id, username, score, territories, correct_answers, is_winner, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (game_id, user_id) DO UPDATE SET
             username = EXCLUDED.username,
             score = EXCLUDED.score,
             territories = EXCLUDED.territories,
             correct_answers = EXCLUDED.correct_answers,
             is_winner = EXCLUDED.is_winner`,
          [
            game.id,
            p.userId,
            p.username,
            p.score,
            p.territories,
            p.correctAnswers,
            p.isWinner,
            game.createdAt,
          ]
        );
      }
    });
  } catch (err: any) {
    console.error('[PostgreSQL insertGame error]:', err.message);
  }
}

export async function createFriendRequestWithNotificationToPostgres(
  f: FriendRecord,
  n: NotificationRecord
): Promise<void> {
  if (!isPostgresConfigured()) return;
  try {
    await withPostgresTransaction(async (client) => {
      await client.query(
        `INSERT INTO friends (id, requester_id, recipient_id, status, created_at)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
        [f.id, f.requesterId, f.recipientId, f.status, f.createdAt]
      );
      await client.query(
        `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET is_read = EXCLUDED.is_read`,
        [n.id, n.userId, n.title, n.message, n.type, n.isRead, n.createdAt]
      );
    });
  } catch (err: any) {
    console.error('[PostgreSQL createFriendRequestWithNotification error]:', err.message);
  }
}

export async function upsertFriendToPostgres(
  f: FriendRecord,
  client?: QueryableClient
): Promise<void> {
  const executor = client || getPostgresPool();
  if (!executor) return;
  try {
    await executor.query(
      `INSERT INTO friends (id, requester_id, recipient_id, status, created_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status`,
      [f.id, f.requesterId, f.recipientId, f.status, f.createdAt]
    );
  } catch (err: any) {
    console.error('[PostgreSQL upsertFriend error]:', err.message);
    if (client) throw err;
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

export async function upsertNotificationToPostgres(
  n: NotificationRecord,
  client?: QueryableClient
): Promise<void> {
  const executor = client || getPostgresPool();
  if (!executor) return;
  try {
    await executor.query(
      `INSERT INTO notifications (id, user_id, title, message, type, is_read, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET is_read = EXCLUDED.is_read`,
      [n.id, n.userId, n.title, n.message, n.type, n.isRead, n.createdAt]
    );
  } catch (err: any) {
    console.error('[PostgreSQL upsertNotification error]:', err.message);
    if (client) throw err;
  }
}

export async function saveActiveGameSnapshotsToPostgres(
  games: GameState[],
  interrupted = true
): Promise<void> {
  if (!isPostgresConfigured() || !games.length) return;
  try {
    await withPostgresTransaction(async (client) => {
      for (const g of games) {
        if (g.phase === 'finished') continue;
        await client.query(
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
    });
  } catch (err: any) {
    console.error('[PostgreSQL saveActiveGameSnapshots error]:', err.message);
  }
}

export async function loadActiveGameSnapshotsFromPostgres(): Promise<GameState[]> {
  const pgPool = getPostgresPool();
  if (!pgPool) return [];
  try {
    const res = await pgPool.query(
      'SELECT room_id, state_json FROM active_game_snapshots ORDER BY updated_at DESC'
    );
    const restored: GameState[] = [];
    for (const row of res.rows) {
      const state =
        typeof row.state_json === 'string' ? JSON.parse(row.state_json) : row.state_json;
      if (state && state.roomId && state.phase !== 'finished') {
        restored.push(state as GameState);
      }
    }
    return restored;
  } catch (err: any) {
    console.error('[PostgreSQL loadActiveGameSnapshots error]:', err.message);
    return [];
  }
}

export async function deleteActiveGameSnapshotFromPostgres(roomId: string): Promise<void> {
  const pgPool = getPostgresPool();
  if (!pgPool) return;
  try {
    await pgPool.query('DELETE FROM active_game_snapshots WHERE room_id = $1', [roomId]);
  } catch (err: any) {
    console.error('[PostgreSQL deleteActiveGameSnapshot error]:', err.message);
  }
}

export async function closePostgresPool(): Promise<void> {
  if (pool && !injectedTestPool) {
    await pool.end();
  }
  pool = null;
  injectedTestPool = null;
  postgresReady = false;
}
