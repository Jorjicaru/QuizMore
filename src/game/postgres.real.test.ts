import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import express from 'express';
import pg from 'pg';
import {
  getPostgresPool,
  initPostgresSchema,
  setTransactionObserverForTesting,
  saveActiveGameSnapshotsToPostgres,
  loadActiveGameSnapshotsFromPostgres,
  deleteActiveGameSnapshotFromPostgres,
  consumePasswordResetTokenAndUpdatePasswordInPostgres,
  closePostgresPool,
} from '../../server/postgresRepo';
import { db } from '../../server/db';
import { GameManager } from '../../server/gameEngine';
import authRoutes, { clearPasswordResetRateLimitsForTesting } from '../../server/routes/authRoutes';
import questionRoutes from '../../server/routes/questionRoutes';
import socialRoutes from '../../server/routes/socialRoutes';
import {
  hashResetToken,
  setEmailSenderForTesting,
  sanitizeSmtpErrorForLogging,
} from '../../server/emailService';
import { executeJsonToPostgresMigration } from '../../scripts/migrate_json_to_postgres';

const { Pool } = pg;

// Ensure real PostgreSQL mode is enabled for this test suite
process.env.POSTGRES_ENABLED = 'true';
process.env.APP_URL = 'https://conquiz.oficial-test.ro';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'real_postgres_test_jwt_secret_minimum_32_characters_long_v92';

if (!process.env.DATABASE_URL) {
  throw new Error(
    'EROARE: src/game/postgres.real.test.ts necesită un server PostgreSQL REAL și variabila DATABASE_URL setată!'
  );
}

async function httpRequest(
  baseUrl: string,
  method: string,
  endpoint: string,
  body?: any,
  headers: Record<string, string> = {}
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

test('V9.2 REAL PostgreSQL Test 1: Conexiune reală pg, inițializare schemă (001 + 002) și verificare versiune server PostgreSQL', async () => {
  const ok = await initPostgresSchema();
  assert.equal(ok, true, 'Schema PostgreSQL reală (001_init + 002_password_reset) trebuie aplicată cu succes');

  const pool = getPostgresPool();
  assert.ok(pool, 'Pool-ul PostgreSQL real trebuie să fie activ');

  const verRes = await pool.query('SELECT version() AS ver, current_database() AS db');
  assert.ok(
    verRes.rows[0].ver.toLowerCase().includes('postgresql'),
    `Trebuie să ruleze pe un server PostgreSQL real (găsit: ${verRes.rows[0].ver})`
  );

  // Clean tables before full test suite
  await pool.query(
    'TRUNCATE TABLE password_reset_tokens, game_player_results, games, friends, notifications, active_game_snapshots, users RESTART IDENTITY CASCADE'
  );

  await db.init();
});

test('V9.2 REAL PostgreSQL Test 2: Înregistrare, autentificare, actualizare profil și dovada că răspunsul HTTP vine DOAR după confirmarea COMMIT în PostgreSQL', async () => {
  const pool = getPostgresPool()!;
  const events: string[] = [];

  setTransactionObserverForTesting((ev) => {
    events.push(`PG_${ev}`);
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/questions', questionRoutes);
  app.use('/api/social', socialRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Register user via HTTP endpoint
    const regRes = await httpRequest(baseUrl, 'POST', '/api/auth/register', {
      username: 'VoievodRealPG',
      email: 'voievod.real@conquiz.ro',
      password: 'ParolaSiguraRealPG123!',
      confirmPassword: 'ParolaSiguraRealPG123!',
    });
    events.push('HTTP_REGISTER_RESPONSE_RECEIVED');

    assert.equal(regRes.status, 200, 'Înregistrarea trebuie să returneze 200 OK');
    assert.ok(regRes.data.token, 'Trebuie să returneze JWT token');

    // Prove COMMIT occurred BEFORE HTTP response was received by the client
    const commitIdx = events.indexOf('PG_COMMIT');
    const respIdx = events.indexOf('HTTP_REGISTER_RESPONSE_RECEIVED');
    assert.ok(commitIdx >= 0, 'Tranzacția PostgreSQL reală a executat COMMIT');
    assert.ok(
      commitIdx < respIdx,
      `PostgreSQL COMMIT (index ${commitIdx}) trebuie să aibă loc ÎNAINTE de răspunsul HTTP către client (index ${respIdx}). Ordine: ${events.join(' -> ')}`
    );

    // Verify user is persisted in real PostgreSQL table
    const pgUser = await pool.query('SELECT * FROM users WHERE email = $1', [
      'voievod.real@conquiz.ro',
    ]);
    assert.equal(pgUser.rows.length, 1, 'Utilizatorul există în tabelul PostgreSQL users');
    assert.equal(pgUser.rows[0].username, 'VoievodRealPG');
    assert.equal(pgUser.rows[0].token_version, 1);

    // 2. Login via HTTP endpoint
    const loginRes = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
      loginIdentifier: 'voievod.real@conquiz.ro',
      password: 'ParolaSiguraRealPG123!',
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.data.token;

    // 3. Profile update via HTTP endpoint (awaited COMMIT)
    events.length = 0;
    const profRes = await httpRequest(
      baseUrl,
      'PUT',
      '/api/auth/profile',
      { bio: 'Apărător al Carpaților în PostgreSQL real', avatar: 'av_stefan' },
      { Authorization: `Bearer ${token}` }
    );
    events.push('HTTP_PROFILE_RESPONSE_RECEIVED');
    assert.equal(profRes.status, 200);
    assert.ok(
      events.indexOf('PG_COMMIT') >= 0 &&
        events.indexOf('PG_COMMIT') < events.indexOf('HTTP_PROFILE_RESPONSE_RECEIVED'),
      'Actualizarea profilului confirmă COMMIT în PostgreSQL înainte de răspunsul HTTP'
    );

    const pgUserAfter = await pool.query('SELECT avatar FROM users WHERE email = $1', [
      'voievod.real@conquiz.ro',
    ]);
    assert.equal(pgUserAfter.rows[0].avatar, 'av_stefan');
  } finally {
    setTransactionObserverForTesting(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('V9.2 REAL PostgreSQL Test 3: Adăugare întrebare, înregistrare meci + game_player_results, cereri de prietenie + notificări și comportamentul ROLLBACK la eroare', async () => {
  const pool = getPostgresPool()!;
  const events: string[] = [];
  setTransactionObserverForTesting((ev) => events.push(`PG_${ev}`));

  try {
    const u1 = db.findUserByEmail('voievod.real@conquiz.ro')!;
    assert.ok(u1);

    // Create second user in real PostgreSQL
    const nowIso = new Date().toISOString();
    const u2 = await db.createUser({
      id: 'u_real_pg_2',
      username: 'MirceaRealPG',
      email: 'mircea.real@conquiz.ro',
      passwordHash: 'hash_mircea',
      role: 'user',
      tokenVersion: 1,
      createdAt: nowIso,
      profile: {
        id: 'u_real_pg_2',
        username: 'MirceaRealPG',
        email: 'mircea.real@conquiz.ro',
        role: 'user',
        avatar: 'av_mircea',
        title: 'Voievod',
        rating: 1200,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        territoriesConquered: 0,
        correctAnswersTotal: 0,
        highestScore: 0,
        createdAt: nowIso,
      },
    });
    assert.equal(u2.username, 'MirceaRealPG');

    // 1. Add question to real PostgreSQL
    const addedQ = await db.addQuestion({
      id: 'q_real_pg_test_1',
      type: 'choice',
      category: 'istorie',
      difficulty: 'mediu',
      question: 'În ce an a avut loc Bătălia de la Rovine condusă de Mircea cel Bătrân?',
      options: ['1395', '1457', '1595', '1600'],
      correctAnswerIndex: 0,
      explanation: 'Bătălia de la Rovine a avut loc în anul 1395.',
      reviewStatus: 'approved',
      sourceUrl: 'https://ro.wikipedia.org/wiki/B%C4%83t%C4%83lia_de_la_Rovine',
      sourceTitle: 'Bătălia de la Rovine',
      sourceCheckedAt: '2026-11-10',
    });
    assert.equal(addedQ.id, 'q_real_pg_test_1');

    const pgQ = await pool.query('SELECT id, category, review_status FROM questions WHERE id = $1', [
      'q_real_pg_test_1',
    ]);
    assert.equal(pgQ.rows.length, 1);
    assert.equal(pgQ.rows[0].review_status, 'approved');

    // 2. Record match and per-player results in real PostgreSQL
    await db.recordGame({
      id: 'game_real_pg_1',
      roomId: 'RO1395',
      createdAt: nowIso,
      durationSeconds: 360,
      playerCount: 2,
      winnerId: u1.id,
      winnerUsername: u1.username,
      playersSummary: [
        {
          userId: u1.id,
          username: u1.username,
          score: 5400,
          territories: 27,
          correctAnswers: 14,
          isWinner: true,
        },
        {
          userId: u2.id,
          username: u2.username,
          score: 2200,
          territories: 14,
          correctAnswers: 7,
          isWinner: false,
        },
      ],
    });

    const pgGame = await pool.query('SELECT * FROM games WHERE id = $1', ['game_real_pg_1']);
    const pgResults = await pool.query(
      'SELECT * FROM game_player_results WHERE game_id = $1 ORDER BY score DESC',
      ['game_real_pg_1']
    );
    assert.equal(pgGame.rows.length, 1);
    assert.equal(pgResults.rows.length, 2);
    assert.equal(pgResults.rows[0].user_id, u1.id);
    assert.equal(pgResults.rows[0].score, 5400);
    assert.equal(pgResults.rows[0].is_winner, true);

    // 3. Friend request + notification in real PostgreSQL
    const friendRes = await db.sendFriendRequest(u1.id, u2.id);
    assert.ok(friendRes, 'Cererea de prietenie trebuie creată');
    assert.equal(friendRes.status, 'pending');

    const pgFriends = await pool.query(
      'SELECT * FROM friends WHERE requester_id = $1 AND recipient_id = $2',
      [u1.id, u2.id]
    );
    const pgNotifs = await pool.query('SELECT * FROM notifications WHERE user_id = $1', [u2.id]);
    assert.equal(pgFriends.rows.length, 1);
    assert.equal(pgFriends.rows[0].status, 'pending');
    assert.equal(pgNotifs.rows.length, 1);

    // Accept friend request
    const acceptRes = await db.respondFriendRequest(pgFriends.rows[0].id, true);
    assert.equal(acceptRes, true);
    const pgFriendsAccepted = await pool.query('SELECT status FROM friends WHERE id = $1', [
      pgFriends.rows[0].id,
    ]);
    assert.equal(pgFriendsAccepted.rows[0].status, 'accepted');

    // 4. Test ROLLBACK behavior and cache consistency when PostgreSQL rejects a write
    events.length = 0;
    const notifCountBeforeMemory = db.getNotifications(u1.id).length;
    const notifCountBeforePg = (
      await pool.query('SELECT COUNT(*)::int AS cnt FROM notifications')
    ).rows[0].cnt;

    await assert.rejects(
      async () => {
        // Attempt to insert a notification for a user ID that does NOT exist in PostgreSQL users table (violates FK user_id REFERENCES users(id))
        await db.addNotification({
          id: 'notif_fk_fail_999',
          userId: 'non_existent_fk_user_99999',
          type: 'system',
          title: 'Test Rollback FK',
          message: 'Această tranzacție trebuie să facă ROLLBACK în PostgreSQL!',
          isRead: false,
          createdAt: nowIso,
        });
      },
      /foreign key constraint|notifications_user_id_fkey/i,
      'Eroarea PostgreSQL reală (FK violation) trebuie propagată către apelant'
    );

    assert.ok(
      events.includes('PG_ROLLBACK'),
      `Tranzacția PostgreSQL a executat ROLLBACK la eroare (evenimente: ${events.join(', ')})`
    );
    const notifCountAfterPg = (
      await pool.query('SELECT COUNT(*)::int AS cnt FROM notifications')
    ).rows[0].cnt;
    assert.equal(
      notifCountAfterPg,
      notifCountBeforePg,
      'Tabelul PostgreSQL notifications a rămas neschimbat după ROLLBACK'
    );
    assert.equal(
      db.getNotifications('non_existent_fk_user_99999').length,
      0,
      'Cache-ul din memorie NU a păstrat nicio înregistrare falsă după ROLLBACK'
    );
    assert.equal(db.getNotifications(u1.id).length, notifCountBeforeMemory);
  } finally {
    // Clean up temporary test question so canonical approved question count remains 6,241
    await db.deleteQuestion('q_real_pg_test_1');
    setTransactionObserverForTesting(null);
  }
});

test('V9.2 REAL PostgreSQL Test 4: Resetarea parolei prin email (token valid, invalid, expirat, reutilizat, invalidare token precedent, adresă existentă/inexistentă, limitare rată, APP_URL strict, email eșuat, invalidare JWT anterior și ROLLBACK atomic)', async () => {
  const pool = getPostgresPool()!;
  clearPasswordResetRateLimitsForTesting();

  const capturedEmails: Array<{
    toEmail: string;
    username: string;
    resetUrl: string;
    expiresInMinutes: number;
  }> = [];
  setEmailSenderForTesting(async (params) => {
    capturedEmails.push(params);
  });

  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as { port: number }).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Login before reset to get an active JWT token (tokenVersion = 1)
    const initialLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
      loginIdentifier: 'voievod.real@conquiz.ro',
      password: 'ParolaSiguraRealPG123!',
    });
    assert.equal(initialLogin.status, 200);
    const oldJwtToken = initialLogin.data.token;

    // Verify oldJwtToken works on /api/auth/me right now
    const meBefore = await httpRequest(baseUrl, 'GET', '/api/auth/me', undefined, {
      Authorization: `Bearer ${oldJwtToken}`,
    });
    assert.equal(meBefore.status, 200);

    // 2. Existing vs Non-Existing email return the EXACT same generic message (anti-enumeration)
    const nonExistingForgot = await httpRequest(
      baseUrl,
      'POST',
      '/api/auth/forgot-password',
      { email: 'inexistent.cont.999@conquiz.ro' },
      { Host: 'evil-attacker-host.com' }
    );
    const existingForgot1 = await httpRequest(
      baseUrl,
      'POST',
      '/api/auth/forgot-password',
      { email: 'voievod.real@conquiz.ro' },
      { Host: 'evil-attacker-host.com' }
    );

    assert.equal(nonExistingForgot.status, 200);
    assert.equal(existingForgot1.status, 200);
    assert.equal(
      nonExistingForgot.data.message,
      existingForgot1.data.message,
      'Răspunsul pentru adrese existente și inexistente trebuie să fie identic'
    );
    assert.equal(capturedEmails.length, 1, 'Emailul s-a trimis doar pentru contul real');

    // 3. Verify reset URL is built strictly from APP_URL, NEVER from Host header
    const firstResetUrl = capturedEmails[0].resetUrl;
    assert.ok(
      firstResetUrl.startsWith('https://conquiz.oficial-test.ro/?resetToken='),
      `Linkul de resetare trebuie construit strict din APP_URL (actual: ${firstResetUrl})`
    );
    assert.equal(
      firstResetUrl.includes('evil-attacker-host.com'),
      false,
      'Header-ul Host nu este folosit niciodată la construirea linkului de resetare'
    );

    const firstRawToken = new URL(firstResetUrl).searchParams.get('resetToken')!;
    assert.equal(firstRawToken.length, 64, 'Tokenul brut are 64 caractere hex (256 biți entropie)');

    // 4. Verify ONLY the SHA-256 hash of the token is stored in PostgreSQL (never the raw token)
    const firstTokenHash = hashResetToken(firstRawToken);
    const dbTokenRow1 = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
      [firstTokenHash]
    );
    assert.equal(dbTokenRow1.rows.length, 1);
    const rawCheck = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token_hash = $1',
      [firstRawToken]
    );
    assert.equal(rawCheck.rows.length, 0, 'Tokenul în clar nu există în PostgreSQL');

    // 5. Request a second token for the same user -> previous token must be automatically invalidated!
    const existingForgot2 = await httpRequest(baseUrl, 'POST', '/api/auth/forgot-password', {
      email: 'voievod.real@conquiz.ro',
    });
    assert.equal(existingForgot2.status, 200);
    assert.equal(capturedEmails.length, 2);
    const secondRawToken = new URL(capturedEmails[1].resetUrl).searchParams.get('resetToken')!;

    const firstTokenAfterSecondReq = await pool.query(
      'SELECT invalidated_at FROM password_reset_tokens WHERE token_hash = $1',
      [firstTokenHash]
    );
    assert.ok(
      firstTokenAfterSecondReq.rows[0].invalidated_at !== null,
      'Primul token a fost invalidat automat la generarea celui de-al doilea token'
    );

    // Trying to use the first (invalidated) token must fail
    const useInvalidatedRes = await httpRequest(baseUrl, 'POST', '/api/auth/reset-password', {
      token: firstRawToken,
      newPassword: 'ParolaNouaTestInvalid123!',
      confirmPassword: 'ParolaNouaTestInvalid123!',
    });
    assert.equal(useInvalidatedRes.status, 400);

    // 6. Test invalid (non-existent) token
    const invalidTokenRes = await httpRequest(baseUrl, 'POST', '/api/auth/reset-password', {
      token: 'a'.repeat(64),
      newPassword: 'ParolaNouaTestInvalid123!',
      confirmPassword: 'ParolaNouaTestInvalid123!',
    });
    assert.equal(invalidTokenRes.status, 400);

    // 7. Test expired token
    const expiredRawToken = 'b'.repeat(64);
    const user = db.findUserByEmail('voievod.real@conquiz.ro')!;
    await db.createPasswordResetToken(user.id, expiredRawToken, -60_000); // expired 1 minute ago

    const expiredTokenRes = await httpRequest(baseUrl, 'POST', '/api/auth/reset-password', {
      token: expiredRawToken,
      newPassword: 'ParolaNouaTestExpirat123!',
      confirmPassword: 'ParolaNouaTestExpirat123!',
    });
    assert.equal(expiredTokenRes.status, 400, 'Tokenul expirat trebuie respins cu 400');

    // 8. Test atomic ROLLBACK during password reset if an error occurs before COMMIT
    clearPasswordResetRateLimitsForTesting();
    await httpRequest(baseUrl, 'POST', '/api/auth/forgot-password', {
      email: 'voievod.real@conquiz.ro',
    });
    const thirdRawToken = new URL(
      capturedEmails[capturedEmails.length - 1].resetUrl
    ).searchParams.get('resetToken')!;
    const thirdTokenHash = hashResetToken(thirdRawToken);

    await assert.rejects(
      async () => {
        await consumePasswordResetTokenAndUpdatePasswordInPostgres({
          tokenHash: thirdTokenHash,
          newPasswordHash: 'hash_care_nu_trebuie_salvat',
          nowIso: new Date().toISOString(),
          beforeCommitHook: async () => {
            throw new Error('Eroare simulată înainte de COMMIT la resetarea parolei');
          },
        });
      },
      /Eroare simulată înainte de COMMIT/
    );

    // Verify token is STILL unused and password/token_version did NOT change after ROLLBACK
    const tokenAfterRollback = await pool.query(
      'SELECT used_at FROM password_reset_tokens WHERE token_hash = $1',
      [thirdTokenHash]
    );
    assert.equal(
      tokenAfterRollback.rows[0].used_at,
      null,
      'După ROLLBACK, tokenul de resetare rămâne neconsumat (used_at IS NULL)'
    );
    const userAfterRollback = await pool.query(
      'SELECT password_hash, token_version FROM users WHERE id = $1',
      [user.id]
    );
    assert.equal(
      userAfterRollback.rows[0].token_version,
      1,
      'După ROLLBACK, token_version al utilizatorului rămâne neschimbat'
    );

    // 9. Now consume the valid token (`thirdRawToken`) via HTTP endpoint
    const validResetRes = await httpRequest(baseUrl, 'POST', '/api/auth/reset-password', {
      token: thirdRawToken,
      newPassword: 'ParolaNouaVoievod2026!',
      confirmPassword: 'ParolaNouaVoievod2026!',
    });
    assert.equal(validResetRes.status, 200, 'Resetarea cu token valid trebuie să reușească (200 OK)');

    // 10. Verify single-use: trying to reuse `thirdRawToken` a second time must be rejected (400)
    const reuseRes = await httpRequest(baseUrl, 'POST', '/api/auth/reset-password', {
      token: thirdRawToken,
      newPassword: 'AltaParolaReutilizare123!',
      confirmPassword: 'AltaParolaReutilizare123!',
    });
    assert.equal(reuseRes.status, 400, 'Tokenul deja folosit nu poate fi reutilizat');

    // 11. Verify old JWT token is immediately invalidated because token_version incremented in PostgreSQL
    const meAfterResetWithOldToken = await httpRequest(baseUrl, 'GET', '/api/auth/me', undefined, {
      Authorization: `Bearer ${oldJwtToken}`,
    });
    assert.equal(
      meAfterResetWithOldToken.status,
      401,
      'Sesiunile/tokenurile JWT emise înainte de schimbarea parolei sunt invalidate automat'
    );

    // 12. Verify login with old password fails and login with new password succeeds
    const oldPassLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
      loginIdentifier: 'voievod.real@conquiz.ro',
      password: 'ParolaSiguraRealPG123!',
    });
    assert.equal(oldPassLogin.status, 401);

    const newPassLogin = await httpRequest(baseUrl, 'POST', '/api/auth/login', {
      loginIdentifier: 'voievod.real@conquiz.ro',
      password: 'ParolaNouaVoievod2026!',
    });
    assert.equal(newPassLogin.status, 200);

    // 13. Test SMTP failure behavior: does not leak account existence, invalidates unsent token, sanitizes logs
    clearPasswordResetRateLimitsForTesting();
    setEmailSenderForTesting(async () => {
      throw new Error(
        `SMTP connection refused for voievod.real@conquiz.ro with url https://conquiz.oficial-test.ro/?resetToken=${'f'.repeat(64)}`
      );
    });

    const smtpFailRes = await httpRequest(baseUrl, 'POST', '/api/auth/forgot-password', {
      email: 'voievod.real@conquiz.ro',
    });
    assert.equal(
      smtpFailRes.status,
      200,
      'La eșecul SMTP, endpoint-ul răspunde cu același mesaj generic 200 fără a dezvălui că adresa există'
    );
    assert.equal(smtpFailRes.data.message, nonExistingForgot.data.message);

    // Verify all tokens for this user are either used or invalidated (none left active after SMTP failure)
    const activeTokensAfterSmtpFail = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL AND invalidated_at IS NULL',
      [user.id]
    );
    assert.equal(
      activeTokensAfterSmtpFail.rows[0].cnt,
      0,
      'Tokenul al cărui email a eșuat la trimitere este invalidat automat în PostgreSQL'
    );

    // Verify sanitizeSmtpErrorForLogging strips URLs, emails, and 64-hex tokens
    const rawSmtpErr = new Error(
      `Failed sending to voievod.real@conquiz.ro link https://conquiz.oficial-test.ro/?resetToken=${'c'.repeat(64)}`
    );
    const sanitizedLog = sanitizeSmtpErrorForLogging(rawSmtpErr);
    assert.equal(sanitizedLog.includes('voievod.real@conquiz.ro'), false);
    assert.equal(sanitizedLog.includes('c'.repeat(64)), false);
    assert.equal(sanitizedLog.includes('resetToken='), false);

    // 14. Test Rate Limiting on /api/auth/forgot-password (max 5 requests per 15 min window)
    clearPasswordResetRateLimitsForTesting();
    setEmailSenderForTesting(async () => {});
    for (let i = 0; i < 5; i++) {
      const r = await httpRequest(baseUrl, 'POST', '/api/auth/forgot-password', {
        email: `rate.test.${i}@conquiz.ro`,
      });
      assert.equal(r.status, 200);
    }
    const rateLimitedRes = await httpRequest(baseUrl, 'POST', '/api/auth/forgot-password', {
      email: 'rate.test.overflow@conquiz.ro',
    });
    assert.equal(
      rateLimitedRes.status,
      429,
      'A 6-a solicitare consecutivă de resetare a parolei este blocată prin limitare de rată (HTTP 429)'
    );
  } finally {
    setEmailSenderForTesting(null);
    clearPasswordResetRateLimitsForTesting();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('V9.2 REAL PostgreSQL Test 5: Salvare și restaurare snapshot-uri camere active (fără camere terminate, fără duplicate la restaurare, păstrarea exactă a timpului rămas în timere)', async () => {
  const pool = getPostgresPool()!;
  await pool.query('TRUNCATE TABLE active_game_snapshots');

  const gmBefore = new GameManager();
  const gmAfter = new GameManager();

  try {
    // 1. Create an active room in question phase with only 4 seconds remaining out of 12 seconds
    const activeRoom = gmBefore.createRoom({
      hostUser: { id: 'u_snap_host', username: 'SnapHost', avatar: 'av_vlad' },
      maxPlayers: 2,
      initialBotsCount: 1,
      isPrivate: true,
    });
    gmBefore.startGame(activeRoom.roomId, 'u_snap_host');

    const game = gmBefore.getRoom(activeRoom.roomId)!;
    const sampleQ = gmBefore.getRandomQuestion(game, 'choice')!;
    const nowBeforeSave = Date.now();
    // Question started 8 seconds ago (duration 12s -> ~4s remaining)
    game.phase = 'conquest';
    game.currentQuestion = {
      questionInstanceId: 'qi_snap_timer_test',
      question: sampleQ,
      startTime: nowBeforeSave - 8000,
      durationSeconds: 12,
      attackerId: 'u_snap_host',
      phaseContext: 'conquest',
      participantIds: game.players.map((p) => p.id),
      playerAnswers: {},
      resolved: false,
    };

    // 2. Also create a FINISHED room to verify it is NEVER saved as an active snapshot
    const finishedRoom = gmBefore.createRoom({
      hostUser: { id: 'u_fin_host', username: 'FinHost', avatar: 'av_stefan' },
      maxPlayers: 2,
      initialBotsCount: 1,
      isPrivate: true,
    });
    gmBefore.getRoom(finishedRoom.roomId)!.phase = 'finished';

    // Save snapshots via persistActiveSnapshotsNow
    await gmBefore.persistActiveSnapshotsNow(false);

    const snapRows = await pool.query('SELECT room_id, phase FROM active_game_snapshots');
    assert.equal(
      snapRows.rows.length,
      1,
      'Doar camera activă este salvată în active_game_snapshots (camera finished este ignorată)'
    );
    assert.equal(snapRows.rows[0].room_id, activeRoom.roomId);

    // 3. Load snapshots from real PostgreSQL and restore into gmAfter
    const loadedSnapshots = await loadActiveGameSnapshotsFromPostgres();
    assert.equal(loadedSnapshots.length, 1);

    // Pass duplicated array to prove restoreGamesFromSnapshots deduplicates rooms
    const restoredCount1 = gmAfter.restoreGamesFromSnapshots([
      loadedSnapshots[0],
      loadedSnapshots[0],
    ]);
    assert.equal(restoredCount1, 1, 'Nu se creează camere duplicate la restaurare');

    const restoredCount2 = gmAfter.restoreGamesFromSnapshots(loadedSnapshots);
    assert.equal(
      restoredCount2,
      0,
      'Apelul repetat restoreGamesFromSnapshots nu suprascrie și nu dublează camera deja activă'
    );

    // 4. Verify timer preservation: remaining time on currentQuestion must be ~4s (<= 4500ms), NEVER reset to 12000ms!
    const restoredGame = gmAfter.getRoom(activeRoom.roomId)!;
    assert.ok(restoredGame.currentQuestion);
    const nowAfterRestore = Date.now();
    const totalDurationMs = restoredGame.currentQuestion.durationSeconds * 1000;
    const remainingAfterRestoreMs =
      restoredGame.currentQuestion.startTime + totalDurationMs - nowAfterRestore;

    assert.ok(
      remainingAfterRestoreMs <= 4500 && remainingAfterRestoreMs >= 2500,
      `Timerul restaurat trebuie să păstreze strict timpul rămas (~4000ms), fără a acorda 12000ms suplimentari (actual: ${remainingAfterRestoreMs}ms)`
    );

    // 5. Verify ending the game deletes its snapshot from PostgreSQL
    await deleteActiveGameSnapshotFromPostgres(activeRoom.roomId);
    const snapRowsAfterDelete = await pool.query('SELECT COUNT(*)::int AS cnt FROM active_game_snapshots');
    assert.equal(snapRowsAfterDelete.rows[0].cnt, 0);
  } finally {
    gmBefore.shutdownAllRooms();
    gmAfter.shutdownAllRooms();
  }
});

test('V9.2 REAL PostgreSQL Test 6: Migrare JSON -> PostgreSQL executată de două ori (0 duplicate) + pg_dump backup și restore într-o bază PostgreSQL separată cu compararea numărului de înregistrări', async () => {
  const pool = getPostgresPool()!;

  // 1. Run migration TWICE against real PostgreSQL
  const report1 = await executeJsonToPostgresMigration({ closePoolWhenDone: false });
  const countsAfterRun1 = {
    users: (await pool.query('SELECT COUNT(*)::int AS cnt FROM users')).rows[0].cnt,
    questions: (await pool.query('SELECT COUNT(*)::int AS cnt FROM questions')).rows[0].cnt,
    approvedQuestions: (
      await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM questions WHERE review_status = 'approved' AND is_disabled = FALSE"
      )
    ).rows[0].cnt,
    games: (await pool.query('SELECT COUNT(*)::int AS cnt FROM games')).rows[0].cnt,
    results: (await pool.query('SELECT COUNT(*)::int AS cnt FROM game_player_results')).rows[0].cnt,
    friends: (await pool.query('SELECT COUNT(*)::int AS cnt FROM friends')).rows[0].cnt,
    notifications: (await pool.query('SELECT COUNT(*)::int AS cnt FROM notifications')).rows[0].cnt,
  };

  assert.equal(
    countsAfterRun1.approvedQuestions,
    6241,
      `Banca de 6.241 de întrebări aprobate trebuie să fie prezentă în PostgreSQL real (actual: ${countsAfterRun1.approvedQuestions})`
  );

  const report2 = await executeJsonToPostgresMigration({ closePoolWhenDone: false });
  const countsAfterRun2 = {
    users: (await pool.query('SELECT COUNT(*)::int AS cnt FROM users')).rows[0].cnt,
    questions: (await pool.query('SELECT COUNT(*)::int AS cnt FROM questions')).rows[0].cnt,
    approvedQuestions: (
      await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM questions WHERE review_status = 'approved' AND is_disabled = FALSE"
      )
    ).rows[0].cnt,
    games: (await pool.query('SELECT COUNT(*)::int AS cnt FROM games')).rows[0].cnt,
    results: (await pool.query('SELECT COUNT(*)::int AS cnt FROM game_player_results')).rows[0].cnt,
    friends: (await pool.query('SELECT COUNT(*)::int AS cnt FROM friends')).rows[0].cnt,
    notifications: (await pool.query('SELECT COUNT(*)::int AS cnt FROM notifications')).rows[0].cnt,
  };

  assert.deepEqual(
    countsAfterRun2,
    countsAfterRun1,
    'Rularea de două ori a migrării în PostgreSQL real nu dublează nicio înregistrare'
  );
  assert.equal(report1.approvedQuestions, 6241);
  assert.equal(report2.approvedQuestions, 6241);

  // 2. Execute real pg_dump backup script and restore into separate database `conquiz_restore_target`
  const backupDir = path.resolve(process.cwd(), 'backups', 'test_v92_real_pg');
  if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const backupScript = path.resolve(process.cwd(), 'scripts/backup_postgres.sh');
  const restoreScript = path.resolve(process.cwd(), 'scripts/restore_postgres.sh');

  execFileSync('bash', [backupScript, backupDir], {
    env: { ...process.env },
    stdio: 'pipe',
  });

  const backupFiles = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith('.sql.gz'))
    .map((f) => path.join(backupDir, f));
  assert.equal(backupFiles.length, 1, 'Scriptul backup_postgres.sh a generat arhiva .sql.gz');

  // Determine target restore database URL
  const primaryUrl = new URL(process.env.DATABASE_URL!);
  const restoreTargetDbName = 'conquiz_restore_target';
  const adminUrl = new URL(process.env.DATABASE_URL!);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString() });
  try {
    await adminPool.query(`DROP DATABASE IF EXISTS ${restoreTargetDbName}`);
    await adminPool.query(`CREATE DATABASE ${restoreTargetDbName}`);
  } finally {
    await adminPool.end();
  }

  const restoreTargetUrl = new URL(process.env.DATABASE_URL!);
  restoreTargetUrl.pathname = `/${restoreTargetDbName}`;

  try {
    execFileSync('bash', [restoreScript, backupFiles[0], restoreTargetDbName], {
      env: {
        ...process.env,
        DATABASE_URL: restoreTargetUrl.toString(),
      },
      stdio: 'inherit',
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`Restore script failed: ${stderr || String(error)}`);
  }

  // Connect to `conquiz_restore_target` and compare row counts across all tables
  const restorePool = new Pool({ connectionString: restoreTargetUrl.toString() });
  try {
    const restoredCounts = {
      users: (await restorePool.query('SELECT COUNT(*)::int AS cnt FROM users')).rows[0].cnt,
      questions: (await restorePool.query('SELECT COUNT(*)::int AS cnt FROM questions')).rows[0]
        .cnt,
      approvedQuestions: (
        await restorePool.query(
          "SELECT COUNT(*)::int AS cnt FROM questions WHERE review_status = 'approved' AND is_disabled = FALSE"
        )
      ).rows[0].cnt,
      games: (await restorePool.query('SELECT COUNT(*)::int AS cnt FROM games')).rows[0].cnt,
      results: (await restorePool.query('SELECT COUNT(*)::int AS cnt FROM game_player_results'))
        .rows[0].cnt,
      friends: (await restorePool.query('SELECT COUNT(*)::int AS cnt FROM friends')).rows[0].cnt,
      notifications: (await restorePool.query('SELECT COUNT(*)::int AS cnt FROM notifications'))
        .rows[0].cnt,
    };

    assert.deepEqual(
      restoredCounts,
      countsAfterRun2,
      'Baza de date restaurată din pg_dump (conquiz_restore_target) are exact același număr de înregistrări ca baza primară în toate tabelele'
    );
  } finally {
    await restorePool.end();
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true });
    }
    await closePostgresPool();
  }
});
