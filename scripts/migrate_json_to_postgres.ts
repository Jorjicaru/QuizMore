import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import {
  getPostgresPool,
  initPostgresSchema,
  upsertUserToPostgres,
  upsertQuestionToPostgres,
  insertGameToPostgres,
  upsertFriendToPostgres,
  upsertNotificationToPostgres,
  closePostgresPool,
} from '../server/postgresRepo';
import { Database } from '../server/db';

async function runMigration() {
  if (!process.env.DATABASE_URL) {
    console.error('Eroare: Variabila de mediu DATABASE_URL nu este setată.');
    process.exit(1);
  }

  console.log('1. Inițializare schemă PostgreSQL (db/migrations/001_init.sql)...');
  const initialized = await initPostgresSchema();
  if (!initialized) {
    console.error('Nu s-a putut inițializa schema PostgreSQL.');
    process.exit(1);
  }

  const pool = getPostgresPool()!;
  const beforeUsers = await pool.query('SELECT COUNT(*)::int AS cnt FROM users');
  const beforeQuestions = await pool.query('SELECT COUNT(*)::int AS cnt FROM questions');

  const dbJsonPath = path.resolve(process.cwd(), 'data', 'conquiz_db.json');
  const choicePath = path.resolve(process.cwd(), 'data', 'questions', 'choice.json');
  const estimationPath = path.resolve(process.cwd(), 'data', 'questions', 'estimation.json');

  let jsonData: any = { users: {}, questions: [], games: [], friends: [], notifications: [] };
  if (fs.existsSync(dbJsonPath)) {
    jsonData = JSON.parse(fs.readFileSync(dbJsonPath, 'utf-8'));
  }

  const normalizedUsers = Database.normalizeUsersMap(jsonData.users);
  const usersList = Object.values(normalizedUsers);

  const canonicalQuestions: any[] = [];
  if (fs.existsSync(choicePath)) {
    canonicalQuestions.push(...JSON.parse(fs.readFileSync(choicePath, 'utf-8')));
  }
  if (fs.existsSync(estimationPath)) {
    canonicalQuestions.push(...JSON.parse(fs.readFileSync(estimationPath, 'utf-8')));
  }

  console.log(`2. Migrare ${usersList.length} utilizatori...`);
  for (const user of usersList) {
    await upsertUserToPostgres(user);
  }

  console.log(`3. Migrare ${canonicalQuestions.length} întrebări canonice...`);
  for (const q of canonicalQuestions) {
    await upsertQuestionToPostgres(q);
  }

  const gamesList = Array.isArray(jsonData.games) ? jsonData.games : [];
  console.log(`4. Migrare ${gamesList.length} meciuri istorice...`);
  for (const g of gamesList) {
    await insertGameToPostgres(g);
  }

  const friendsList = Array.isArray(jsonData.friends) ? jsonData.friends : [];
  for (const f of friendsList) {
    await upsertFriendToPostgres(f);
  }

  const notifsList = Array.isArray(jsonData.notifications) ? jsonData.notifications : [];
  for (const n of notifsList) {
    await upsertNotificationToPostgres(n);
  }

  const afterUsers = await pool.query('SELECT COUNT(*)::int AS cnt FROM users');
  const afterQuestions = await pool.query('SELECT COUNT(*)::int AS cnt FROM questions');
  const afterApproved = await pool.query(
    "SELECT COUNT(*)::int AS cnt FROM questions WHERE review_status = 'approved' AND is_disabled = FALSE"
  );

  console.log('=== RAPORT MIGRARE JSON -> POSTGRESQL ===');
  console.log(
    JSON.stringify(
      {
        usersBefore: beforeUsers.rows[0].cnt,
        usersAfter: afterUsers.rows[0].cnt,
        questionsBefore: beforeQuestions.rows[0].cnt,
        questionsAfter: afterQuestions.rows[0].cnt,
        approvedQuestions: afterApproved.rows[0].cnt,
        gamesMigrated: gamesList.length,
        friendsMigrated: friendsList.length,
        notificationsMigrated: notifsList.length,
      },
      null,
      2
    )
  );

  await closePostgresPool();
}

runMigration().catch((err) => {
  console.error('Eroare la migrarea în PostgreSQL:', err);
  process.exit(1);
});
