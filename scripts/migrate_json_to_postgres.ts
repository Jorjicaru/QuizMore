import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getPostgresPool,
  initPostgresSchema,
  withPostgresTransaction,
  upsertUserToPostgres,
  upsertQuestionToPostgres,
  insertGameToPostgres,
  upsertFriendToPostgres,
  upsertNotificationToPostgres,
  closePostgresPool,
} from '../server/postgresRepo';
import { Database } from '../server/db';
import { Question } from '../src/types/game';
import { normalizeQuestionText } from '../server/questionsData';

export interface MigrationReport {
  usersBefore: number;
  usersAfter: number;
  questionsBefore: number;
  questionsAfter: number;
  approvedQuestions: number;
  customQuestionsMigrated: number;
  gamesBefore: number;
  gamesAfter: number;
  playerResultsBefore: number;
  playerResultsAfter: number;
  friendsAfter: number;
  notificationsAfter: number;
}

/**
 * Execută migrarea idempotentă JSON -> PostgreSQL.
 * Importă utilizatorii, banca canonică de întrebări, întrebările personalizate/editate din conquiz_db.json,
 * istoricul meciurilor + rezultatele individuale (cu ON CONFLICT (game_id, user_id) DO UPDATE),
 * prieteniile și notificările, fără a duplica sau șterge datele existente la rulări repetate.
 */
export async function executeJsonToPostgresMigration(options?: {
  customDbJsonPath?: string;
  closePoolWhenDone?: boolean;
}): Promise<MigrationReport> {
  const initialized = await initPostgresSchema();
  if (!initialized) {
    throw new Error('Nu s-a putut inițializa schema PostgreSQL.');
  }

  const pool = getPostgresPool();
  if (!pool) {
    throw new Error('Pool-ul PostgreSQL nu este disponibil (verifică DATABASE_URL).');
  }

  const beforeUsers = (await pool.query('SELECT COUNT(*)::int AS cnt FROM users')).rows[0].cnt;
  const beforeQuestions = (await pool.query('SELECT COUNT(*)::int AS cnt FROM questions')).rows[0]
    .cnt;
  const beforeGames = (await pool.query('SELECT COUNT(*)::int AS cnt FROM games')).rows[0].cnt;
  const beforeResults = (
    await pool.query('SELECT COUNT(*)::int AS cnt FROM game_player_results')
  ).rows[0].cnt;

  const dbJsonPath =
    options?.customDbJsonPath || path.resolve(process.cwd(), 'data', 'conquiz_db.json');
  const choicePath = path.resolve(process.cwd(), 'data', 'questions', 'choice.json');
  const estimationPath = path.resolve(process.cwd(), 'data', 'questions', 'estimation.json');

  let jsonData: any = { users: {}, questions: [], games: [], friends: [], notifications: [] };
  if (fs.existsSync(dbJsonPath)) {
    jsonData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));
  }

  const normalizedUsers = Database.normalizeUsersMap(jsonData.users);
  const usersList = Object.values(normalizedUsers);

  const canonicalQuestions: Question[] = [];
  if (fs.existsSync(choicePath)) {
    canonicalQuestions.push(...JSON.parse(fs.readFileSync(choicePath, 'utf-8')));
  }
  if (fs.existsSync(estimationPath)) {
    canonicalQuestions.push(...JSON.parse(fs.readFileSync(estimationPath, 'utf-8')));
  }

  // Merge canonical questions with any custom or modified questions in conquiz_db.json
  const mergedQuestionsMap = new Map<string, Question>();
  const seenFingerprints = new Map<string, string>();

  for (const q of canonicalQuestions) {
    if (!q || !q.id || !q.question) continue;
    const fp = normalizeQuestionText(q.question);
    mergedQuestionsMap.set(q.id, q);
    seenFingerprints.set(fp, q.id);
  }

  let customQuestionsMigrated = 0;
  const jsonQuestions: Question[] = Array.isArray(jsonData.questions) ? jsonData.questions : [];
  for (const q of jsonQuestions) {
    if (!q || !q.id || !q.question) continue;
    const fp = normalizeQuestionText(q.question);
    const existingCanonicalId = mergedQuestionsMap.has(q.id)
      ? q.id
      : seenFingerprints.get(fp);

    if (existingCanonicalId) {
      const base = mergedQuestionsMap.get(existingCanonicalId)!;
      mergedQuestionsMap.set(existingCanonicalId, {
        ...base,
        isDisabled: q.isDisabled ?? base.isDisabled,
        reportedCount: q.reportedCount ?? base.reportedCount,
        reviewStatus: q.reviewStatus || base.reviewStatus || 'draft',
      });
    } else {
      customQuestionsMigrated++;
      mergedQuestionsMap.set(q.id, {
        ...q,
        factKey: q.factKey || `fact_${q.category || 'cg'}_${q.id}`,
        reviewStatus: q.reviewStatus || 'draft',
      });
      seenFingerprints.set(fp, q.id);
    }
  }

  const allQuestionsToMigrate = Array.from(mergedQuestionsMap.values());

  // 1. Migrate users in transaction
  await withPostgresTransaction(async (client) => {
    for (const user of usersList) {
      await upsertUserToPostgres(user, client);
    }
  });

  // 2. Migrate questions in transaction
  await withPostgresTransaction(async (client) => {
    for (const q of allQuestionsToMigrate) {
      await upsertQuestionToPostgres(q, client);
    }
  });

  // 3. Migrate games + game_player_results (idempotent per game transaction)
  const gamesList = Array.isArray(jsonData.games) ? jsonData.games : [];
  for (const g of gamesList) {
    await insertGameToPostgres(g);
  }

  // 4. Migrate friends and notifications in transaction
  const friendsList = Array.isArray(jsonData.friends) ? jsonData.friends : [];
  const notifsList = Array.isArray(jsonData.notifications) ? jsonData.notifications : [];
  await withPostgresTransaction(async (client) => {
    for (const f of friendsList) {
      if (normalizedUsers[f.requesterId] && normalizedUsers[f.recipientId]) {
        await upsertFriendToPostgres(f, client);
      }
    }
    for (const n of notifsList) {
      if (normalizedUsers[n.userId]) {
        await upsertNotificationToPostgres(n, client);
      }
    }
  });

  const afterUsers = (await pool.query('SELECT COUNT(*)::int AS cnt FROM users')).rows[0].cnt;
  const afterQuestions = (await pool.query('SELECT COUNT(*)::int AS cnt FROM questions')).rows[0]
    .cnt;
  const afterApproved = (
    await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM questions WHERE review_status = 'approved' AND is_disabled = FALSE"
    )
  ).rows[0].cnt;
  const afterGames = (await pool.query('SELECT COUNT(*)::int AS cnt FROM games')).rows[0].cnt;
  const afterResults = (
    await pool.query('SELECT COUNT(*)::int AS cnt FROM game_player_results')
  ).rows[0].cnt;
  const afterFriends = (await pool.query('SELECT COUNT(*)::int AS cnt FROM friends')).rows[0].cnt;
  const afterNotifs = (await pool.query('SELECT COUNT(*)::int AS cnt FROM notifications')).rows[0]
    .cnt;

  const report: MigrationReport = {
    usersBefore: Number(beforeUsers),
    usersAfter: Number(afterUsers),
    questionsBefore: Number(beforeQuestions),
    questionsAfter: Number(afterQuestions),
    approvedQuestions: Number(afterApproved),
    customQuestionsMigrated,
    gamesBefore: Number(beforeGames),
    gamesAfter: Number(afterGames),
    playerResultsBefore: Number(beforeResults),
    playerResultsAfter: Number(afterResults),
    friendsAfter: Number(afterFriends),
    notificationsAfter: Number(afterNotifs),
  };

  if (options?.closePoolWhenDone) {
    await closePostgresPool();
  }

  return report;
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  if (!process.env.DATABASE_URL) {
    console.error('Eroare: Variabila de mediu DATABASE_URL nu este setată.');
    process.exit(1);
  }
  executeJsonToPostgresMigration({ closePoolWhenDone: true })
    .then((report) => {
      console.log('=== RAPORT MIGRARE IDEMPOTENTĂ JSON -> POSTGRESQL (V9.1) ===');
      console.log(JSON.stringify(report, null, 2));
    })
    .catch((err) => {
      console.error('Eroare la migrarea în PostgreSQL:', err);
      process.exit(1);
    });
}
