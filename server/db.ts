import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { Question, UserProfile } from '../src/types/game';
import { INITIAL_QUESTIONS, normalizeQuestionText } from './questionsData';
import {
  isPlaceholderValue,
  hasSufficientEntropy,
  isAiStudioPreviewEnv,
} from './envSecurity';
import {
  isPostgresConfigured,
  isPostgresReady,
  initPostgresSchema,
  loadAllFromPostgres,
  seedQuestionsBatchToPostgres,
  upsertUserToPostgres,
  deleteUserFromPostgres,
  upsertQuestionToPostgres,
  deleteQuestionFromPostgres,
  insertGameToPostgres,
  createFriendRequestWithNotificationToPostgres,
  upsertFriendToPostgres,
  deleteFriendFromPostgres,
  upsertNotificationToPostgres,
} from './postgresRepo';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  isBanned?: boolean;
  createdAt: string;
  profile: UserProfile;
}

export interface GameRecord {
  id: string;
  roomId: string;
  createdAt: string;
  durationSeconds: number;
  playerCount: number;
  winnerId: string | null;
  winnerUsername?: string;
  playersSummary: Array<{
    userId: string;
    username: string;
    score: number;
    territories: number;
    correctAnswers: number;
    isWinner: boolean;
  }>;
}

export interface FriendRecord {
  id: string;
  requesterId: string;
  recipientId: string;
  status: 'pending' | 'accepted';
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'friend_request' | 'game_invite' | 'system';
  isRead: boolean;
  createdAt: string;
}

export interface DatabaseSchema {
  users: Record<string, UserRecord>;
  questions: Question[];
  games: GameRecord[];
  friends: FriendRecord[];
  notifications: NotificationRecord[];
}

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DB_DIR, 'conquiz_db.json');

function atomicWriteJson(filePath: string, data: unknown): void {
  const tmpFile = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, filePath);
}

export class Database {
  private data: DatabaseSchema;
  private postgresAuthoritative = false;

  constructor() {
    this.data = this.loadDatabaseFromJsonFallback();
  }

  /**
   * Inițializează conexiunea și încarcă datele direct din PostgreSQL atunci când
   * DATABASE_URL este configurat. În producție, PostgreSQL devine sursa unică de adevăr.
   */
  public async init(): Promise<void> {
    if (!isPostgresConfigured()) {
      this.postgresAuthoritative = false;
      return;
    }

    const ok = await initPostgresSchema();
    if (!ok) {
      if (process.env.NODE_ENV === 'production' && !isAiStudioPreviewEnv(process.env)) {
        throw new Error('Nu s-a putut inițializa schema PostgreSQL.');
      }
      // In development / preview, keep the JSON-backed app available if an optional DB is unreachable.
      this.postgresAuthoritative = false;
      return;
    }

    let pgData = await loadAllFromPostgres();
    if (!pgData) {
      throw new Error('Nu s-au putut încărca datele din PostgreSQL.');
    }

    if (pgData.questions.length === 0 && INITIAL_QUESTIONS.length > 0) {
      await seedQuestionsBatchToPostgres(INITIAL_QUESTIONS);
      pgData = (await loadAllFromPostgres()) || pgData;
    }

    const adminResult = this.addConfiguredAdmin(pgData);
    if (adminResult.adminUser) {
      await upsertUserToPostgres(adminResult.adminUser);
    }

    this.data = pgData;
    this.postgresAuthoritative = true;
  }

  /**
   * Reîncarcă explicit toate tabelele din PostgreSQL în memoria activă.
   */
  public async reloadFromPostgres(): Promise<boolean> {
    if (!isPostgresConfigured()) return false;
    const pgData = await loadAllFromPostgres();
    if (!pgData) return false;
    this.data = pgData;
    this.postgresAuthoritative = true;
    return true;
  }

  public isPostgresPrimary(): boolean {
    return this.postgresAuthoritative;
  }

  /**
   * Explicitly normalizes a raw `users` value from JSON into a plain Record<string, UserRecord>.
   * Fixes the bug where `users: []` (an array, which is truthy for `||=`) would remain an array.
   */
  public static normalizeUsersMap(rawUsers: unknown): Record<string, UserRecord> {
    const normalized: Record<string, UserRecord> = {};
    if (!rawUsers || typeof rawUsers !== 'object') {
      return normalized;
    }
    if (Array.isArray(rawUsers)) {
      for (const item of rawUsers) {
        if (item && typeof item === 'object' && typeof (item as any).id === 'string') {
          normalized[(item as any).id] = item as UserRecord;
        }
      }
      return normalized;
    }
    for (const [key, val] of Object.entries(rawUsers as Record<string, any>)) {
      if (val && typeof val === 'object' && typeof val.id === 'string') {
        normalized[val.id] = val as UserRecord;
      } else if (val && typeof val === 'object') {
        normalized[key] = { ...val, id: key } as UserRecord;
      }
    }
    return normalized;
  }

  public getHealthMetrics(): {
    storageMode: 'postgres' | 'json';
    postgresConnected: boolean;
    totalQuestions: number;
    approvedQuestions: number;
    usersCount: number;
  } {
    const allQ = this.data.questions || [];
    const approvedQ = allQ.filter(
      (q) => !q.isDisabled && q.reviewStatus === 'approved'
    );
    return {
      storageMode: isPostgresConfigured() ? 'postgres' : 'json',
      postgresConnected: isPostgresConfigured() ? isPostgresReady() : true,
      totalQuestions: allQ.length,
      approvedQuestions: approvedQ.length,
      usersCount: Object.keys(this.data.users || {}).length,
    };
  }

  public addConfiguredAdmin(
    data: DatabaseSchema,
    env: NodeJS.ProcessEnv = process.env
  ): { changed: boolean; adminUser?: UserRecord } {
    const email = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
    const username = String(env.ADMIN_USERNAME || 'conquiz-admin').trim();
    const password = String(env.ADMIN_PASSWORD || '');

    const isStrictProd =
      env.STRICT_ENV_VALIDATION === 'true' ||
      (env.NODE_ENV === 'production' && !isAiStudioPreviewEnv(env));

    if (!email && !password) {
      return { changed: false };
    }

    const emailInvalid =
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      isPlaceholderValue(email) ||
      email.endsWith('@example.com') ||
      email.endsWith('@exemplu.ro');

    const minLen = isStrictProd ? 16 : 12;
    const passwordInvalid =
      !password ||
      password.length < minLen ||
      password.length > 128 ||
      isPlaceholderValue(password) ||
      (isStrictProd && !hasSufficientEntropy(password, 6));

    if (emailInvalid || passwordInvalid) {
      if (isStrictProd) {
        if (emailInvalid || isPlaceholderValue(password)) {
          throw new Error(
            'Înlocuiește valorile demonstrative ADMIN_EMAIL și ADMIN_PASSWORD din .env cu propriile date înainte de pornire.'
          );
        }
        throw new Error(
          'ADMIN_PASSWORD trebuie să aibă între 16 și 128 de caractere aleatorii și entropie suficientă.'
        );
      } else {
        console.warn(
          '[CONQUIZ Auth] ADMIN_EMAIL sau ADMIN_PASSWORD din mediu este neconfigurat/prea scurt pentru creare automată admin în modul development/preview.'
        );
        return { changed: false };
      }
    }

    const existingAdmin = Object.values(data.users || {}).find((u) => u.role === 'admin');
    if (existingAdmin) {
      // Allow updating admin email/username/password when valid credentials are provided
      const passwordMatches = bcrypt.compareSync(password, existingAdmin.passwordHash);
      if (
        existingAdmin.email.toLowerCase() === email &&
        existingAdmin.username === username &&
        passwordMatches
      ) {
        return { changed: false };
      }
      existingAdmin.email = email;
      existingAdmin.username = username;
      existingAdmin.passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(12));
      existingAdmin.profile.email = email;
      existingAdmin.profile.username = username;
      return { changed: true, adminUser: existingAdmin };
    }

    if (
      Object.values(data.users || {}).some(
        (user) =>
          user.email.toLowerCase() === email ||
          user.username.toLowerCase() === username.toLowerCase()
      )
    ) {
      if (isStrictProd) {
        throw new Error('ADMIN_EMAIL sau ADMIN_USERNAME este deja folosit de un cont existent.');
      }
      return { changed: false };
    }

    const id = `usr_admin_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const profile: UserProfile = {
      id,
      username,
      email,
      role: 'admin',
      avatar: 'av_razes',
      title: 'Administrator',
      rating: 1200,
      matchesPlayed: 0,
      wins: 0,
      losses: 0,
      territoriesConquered: 0,
      correctAnswersTotal: 0,
      highestScore: 0,
      createdAt,
    };
    const adminUser: UserRecord = {
      id,
      username,
      email,
      passwordHash: bcrypt.hashSync(password, bcrypt.genSaltSync(12)),
      role: 'admin',
      createdAt,
      profile,
    };
    data.users[id] = adminUser;
    return { changed: true, adminUser };
  }

  private loadDatabaseFromJsonFallback(): DatabaseSchema {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    let parsed: DatabaseSchema | null = null;
    let originalSnapshot = '';
    let originalQuestionCount = 0;

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const rawObj = JSON.parse(raw);
        originalSnapshot = JSON.stringify(rawObj);
        originalQuestionCount = Array.isArray(rawObj.questions) ? rawObj.questions.length : 0;

        const canonicalById = new Map<string, Question>();
        const canonicalByFp = new Map<string, Question>();
        for (const seed of INITIAL_QUESTIONS) {
          canonicalById.set(seed.id, seed);
          canonicalByFp.set(normalizeQuestionText(seed.question), seed);
        }

        if (!Array.isArray(rawObj.questions)) rawObj.questions = [];
        const deduplicatedExisting: Question[] = [];
        const existingIds = new Set<string>();
        const existingFingerprints = new Set<string>();

        for (const q of rawObj.questions as Question[]) {
          if (!q || !q.id || !q.question) continue;
          const fp = normalizeQuestionText(q.question);
          if (!fp || existingIds.has(q.id) || existingFingerprints.has(fp)) continue;
          const canonical = canonicalById.get(q.id) || canonicalByFp.get(fp);
          if (canonical) {
            const mergedQ: Question = {
              ...q,
              ...canonical,
              reportedCount: q.reportedCount ?? canonical.reportedCount,
              isDisabled: q.isDisabled ?? canonical.isDisabled,
              reviewStatus: q.reviewStatus || canonical.reviewStatus || 'draft',
            };
            existingIds.add(mergedQ.id);
            existingFingerprints.add(fp);
            deduplicatedExisting.push(mergedQ);
          } else if (q.id.startsWith('q_custom_') || q.id.startsWith('custom_')) {
            const customQ: Question = {
              ...q,
              factKey: q.factKey || `fact_${q.category || 'cg'}_${q.id}`,
              reviewStatus: q.reviewStatus || 'draft',
            };
            existingIds.add(customQ.id);
            existingFingerprints.add(fp);
            deduplicatedExisting.push(customQ);
          }
        }

        for (const seed of INITIAL_QUESTIONS) {
          const fp = normalizeQuestionText(seed.question);
          if (!existingIds.has(seed.id) && !existingFingerprints.has(fp)) {
            existingIds.add(seed.id);
            existingFingerprints.add(fp);
            deduplicatedExisting.push(seed);
          }
        }
        rawObj.questions = deduplicatedExisting;
        rawObj.users = Database.normalizeUsersMap(rawObj.users);
        rawObj.games = Array.isArray(rawObj.games) ? rawObj.games : [];
        rawObj.friends = Array.isArray(rawObj.friends) ? rawObj.friends : [];
        rawObj.notifications = Array.isArray(rawObj.notifications)
          ? rawObj.notifications.filter((notification: any) =>
              ['friend_request', 'game_invite', 'system'].includes(notification.type)
            )
          : [];

        delete rawObj.achievements;
        delete rawObj.userAchievements;
        delete rawObj.dailyMissions;
        delete rawObj.userMissions;
        delete rawObj.shopItems;
        delete rawObj.userInventory;
        for (const user of Object.values(rawObj.users || {}) as any[]) {
          if (user.profile) {
            delete user.profile.level;
            delete user.profile.xp;
            delete user.profile.coins;
          }
        }
        parsed = rawObj as DatabaseSchema;
      } catch (e) {
        console.error('Error reading JSON db file, initializing clean structure:', e);
      }
    }

    if (!parsed) {
      parsed = {
        users: {},
        questions: [...INITIAL_QUESTIONS],
        games: [],
        friends: [],
        notifications: [],
      };
    }

    // Call addConfiguredAdmin OUTSIDE the JSON parse try/catch block so validation errors are never masked
    const { changed: adminChanged } = this.addConfiguredAdmin(parsed);
    if (
      !isPostgresConfigured() &&
      (adminChanged ||
        parsed.questions.length !== originalQuestionCount ||
        JSON.stringify(parsed) !== originalSnapshot)
    ) {
      atomicWriteJson(DB_FILE, parsed);
    }

    return parsed;
  }

  public save(): void {
    // În producție cu PostgreSQL activ, PostgreSQL este sursa principală, nu JSON-ul local
    if (this.postgresAuthoritative || isPostgresConfigured()) {
      return;
    }
    try {
      atomicWriteJson(DB_FILE, this.data);
    } catch (e) {
      console.error('Error saving database file:', e);
    }
  }

  // --- USERS ---
  public findUserById(id: string): UserRecord | undefined {
    return this.data.users[id];
  }

  public findUserByUsername(username: string): UserRecord | undefined {
    return Object.values(this.data.users).find(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  public findUserByEmail(email: string): UserRecord | undefined {
    return Object.values(this.data.users).find(
      (u) => u.email.toLowerCase() === email.toLowerCase()
    );
  }

  public createUser(user: UserRecord): UserRecord {
    this.data.users[user.id] = user;
    this.save();
    void upsertUserToPostgres(user);
    return user;
  }

  public updateUserProfile(userId: string, updates: Partial<UserProfile>): UserProfile | null {
    const user = this.data.users[userId];
    if (!user) return null;
    user.profile = { ...user.profile, ...updates };
    if (updates.username) {
      user.username = updates.username;
    }
    this.save();
    void upsertUserToPostgres(user);
    return user.profile;
  }

  public getAllUsers(): UserRecord[] {
    return Object.values(this.data.users);
  }

  public toggleUserBan(userId: string): boolean {
    const user = this.data.users[userId];
    if (!user) return false;
    user.isBanned = !user.isBanned;
    this.save();
    void upsertUserToPostgres(user);
    return !!user.isBanned;
  }

  public deleteUser(userId: string): boolean {
    if (!this.data.users[userId]) return false;
    delete this.data.users[userId];
    this.save();
    void deleteUserFromPostgres(userId);
    return true;
  }

  public setUserRole(userId: string, role: 'user' | 'admin'): boolean {
    const user = this.data.users[userId];
    if (!user) return false;
    user.role = role;
    user.profile.role = role;
    this.save();
    void upsertUserToPostgres(user);
    return true;
  }

  // --- QUESTIONS ---
  public getAllQuestions(): Question[] {
    return this.data.questions;
  }

  public addQuestion(question: Question): Question {
    // V9.1: Întrebările nou create au reviewStatus = 'draft' în mod implicit
    const normalized: Question = {
      ...question,
      reviewStatus: question.reviewStatus || 'draft',
      verified: question.reviewStatus === 'approved',
      factKey: question.factKey || `fact_${question.category || 'cg'}_${question.id}`,
    };
    this.data.questions.push(normalized);
    this.save();
    void upsertQuestionToPostgres(normalized);
    return normalized;
  }

  public updateQuestion(id: string, updates: Partial<Question>): Question | null {
    const idx = this.data.questions.findIndex((q) => q.id === id);
    if (idx === -1) return null;
    const merged: Question = {
      ...this.data.questions[idx],
      ...updates,
    };
    if (updates.reviewStatus) {
      merged.verified = updates.reviewStatus === 'approved';
    }
    this.data.questions[idx] = merged;
    this.save();
    void upsertQuestionToPostgres(merged);
    return merged;
  }

  public deleteQuestion(id: string): boolean {
    const len = this.data.questions.length;
    this.data.questions = this.data.questions.filter((q) => q.id !== id);
    if (this.data.questions.length !== len) {
      this.save();
      void deleteQuestionFromPostgres(id);
      return true;
    }
    return false;
  }

  // --- GAMES ---
  public recordGame(game: GameRecord): void {
    const existingIdx = this.data.games.findIndex((g) => g.id === game.id);
    if (existingIdx !== -1) {
      this.data.games[existingIdx] = game;
    } else {
      this.data.games.unshift(game);
      if (this.data.games.length > 200) {
        this.data.games.pop();
      }
    }
    this.save();
    void insertGameToPostgres(game);
  }

  public getGamesHistory(limit: number = 20): GameRecord[] {
    return this.data.games.slice(0, limit);
  }

  public getUserGameHistory(userId: string): GameRecord[] {
    return this.data.games.filter((g) =>
      g.playersSummary.some((p) => p.userId === userId)
    );
  }

  // --- FRIENDS ---
  public getFriends(
    userId: string
  ): Array<{
    friend: UserProfile;
    status: 'pending' | 'accepted';
    isRequester: boolean;
    id: string;
  }> {
    const list: Array<{
      friend: UserProfile;
      status: 'pending' | 'accepted';
      isRequester: boolean;
      id: string;
    }> = [];
    for (const f of this.data.friends) {
      if (f.requesterId === userId) {
        const other = this.findUserById(f.recipientId);
        if (other) {
          list.push({ friend: other.profile, status: f.status, isRequester: true, id: f.id });
        }
      } else if (f.recipientId === userId) {
        const other = this.findUserById(f.requesterId);
        if (other) {
          list.push({ friend: other.profile, status: f.status, isRequester: false, id: f.id });
        }
      }
    }
    return list;
  }

  public sendFriendRequest(requesterId: string, recipientId: string): FriendRecord | null {
    if (requesterId === recipientId) return null;
    const exists = this.data.friends.find(
      (f) =>
        (f.requesterId === requesterId && f.recipientId === recipientId) ||
        (f.requesterId === recipientId && f.recipientId === requesterId)
    );
    if (exists) return null;

    const nowIso = new Date().toISOString();
    const record: FriendRecord = {
      id: `fr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requesterId,
      recipientId,
      status: 'pending',
      createdAt: nowIso,
    };
    const notif: NotificationRecord = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: recipientId,
      title: 'Cerere de prietenie nouă',
      message: `${
        this.findUserById(requesterId)?.username || 'Un jucător'
      } ți-a trimis o cerere de prietenie!`,
      type: 'friend_request',
      isRead: false,
      createdAt: nowIso,
    };

    this.data.friends.push(record);
    this.data.notifications.unshift(notif);
    if (this.data.notifications.length > 500) {
      this.data.notifications.pop();
    }
    this.save();
    void createFriendRequestWithNotificationToPostgres(record, notif);
    return record;
  }

  public respondFriendRequest(requestId: string, accept: boolean): boolean {
    const idx = this.data.friends.findIndex((f) => f.id === requestId);
    if (idx === -1) return false;
    if (accept) {
      this.data.friends[idx].status = 'accepted';
      void upsertFriendToPostgres(this.data.friends[idx]);
    } else {
      this.data.friends.splice(idx, 1);
      void deleteFriendFromPostgres(requestId);
    }
    this.save();
    return true;
  }

  // --- NOTIFICATIONS ---
  public getNotifications(userId: string): NotificationRecord[] {
    return this.data.notifications.filter((n) => n.userId === userId).slice(0, 30);
  }

  public addNotification(notif: NotificationRecord): void {
    this.data.notifications.unshift(notif);
    if (this.data.notifications.length > 500) {
      this.data.notifications.pop();
    }
    this.save();
    void upsertNotificationToPostgres(notif);
  }

  public markNotificationAsRead(id: string, userId: string): boolean {
    const notif = this.data.notifications.find((n) => n.id === id && n.userId === userId);
    if (notif) {
      notif.isRead = true;
      this.save();
      void upsertNotificationToPostgres(notif);
      return true;
    }
    return false;
  }
}

export const db = new Database();
