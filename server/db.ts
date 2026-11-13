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
  insertAuditLogToPostgres,
  createPasswordResetTokenToPostgres,
  invalidatePasswordResetTokenInPostgres,
  consumePasswordResetTokenAndUpdatePasswordInPostgres,
  QueryableClient,
} from './postgresRepo';
import { hashResetToken } from './emailService';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  isBanned?: boolean;
  tokenVersion?: number;
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
  roomId?: string;
  senderId?: string;
  senderUsername?: string;
  isRead: boolean;
  createdAt: string;
}

export interface PasswordResetTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string | null;
  invalidatedAt?: string | null;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  adminId: string;
  adminUsername: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, any>;
  createdAt: string;
}

export interface DatabaseSchema {
  users: Record<string, UserRecord>;
  questions: Question[];
  games: GameRecord[];
  friends: FriendRecord[];
  notifications: NotificationRecord[];
  auditLogs?: AuditLogRecord[];
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
  private memoryResetTokens = new Map<string, PasswordResetTokenRecord>();

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
      // În development / preview, păstrăm aplicația disponibilă pe JSON dacă o bază opțională nu răspunde.
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
      existingAdmin.tokenVersion = (existingAdmin.tokenVersion ?? 1) + 1;
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
      tokenVersion: 1,
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
        for (const seed of INITIAL_QUESTIONS) {
          canonicalById.set(seed.id, seed);
        }

        if (!Array.isArray(rawObj.questions)) rawObj.questions = [];
        const deduplicatedExisting: Question[] = [];
        const existingIds = new Set<string>();
        const existingActiveFingerprints = new Set<string>();

        for (const seed of INITIAL_QUESTIONS) {
          const existingRecord = (rawObj.questions as Question[]).find((x) => x && x.id === seed.id);
          const mergedQ: Question = {
            ...seed,
            reportedCount: existingRecord?.reportedCount ?? seed.reportedCount,
          };
          existingIds.add(mergedQ.id);
          if (mergedQ.reviewStatus === 'approved' && !mergedQ.isDisabled) {
            existingActiveFingerprints.add(normalizeQuestionText(mergedQ.question));
          }
          deduplicatedExisting.push(mergedQ);
        }

        for (const q of rawObj.questions as Question[]) {
          if (!q || !q.id || !q.question || existingIds.has(q.id)) continue;
          if (q.id.startsWith('q_custom_') || q.id.startsWith('custom_')) {
            const fp = normalizeQuestionText(q.question);
            if (!fp || existingActiveFingerprints.has(fp)) continue;
            const customQ: Question = {
              ...q,
              factKey: q.factKey || `fact_${q.category || 'cg'}_${q.id}`,
              reviewStatus: q.reviewStatus || 'draft',
            };
            existingIds.add(customQ.id);
            existingActiveFingerprints.add(fp);
            deduplicatedExisting.push(customQ);
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
        rawObj.auditLogs = Array.isArray(rawObj.auditLogs) ? rawObj.auditLogs : [];

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
        auditLogs: [],
      };
    }

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

  public async createUser(user: UserRecord): Promise<UserRecord> {
    const normalizedUser: UserRecord = {
      ...user,
      tokenVersion: user.tokenVersion ?? 1,
      profile: { ...user.profile },
    };
    if (isPostgresConfigured()) {
      await upsertUserToPostgres(normalizedUser);
    }
    this.data.users[normalizedUser.id] = normalizedUser;
    this.save();
    return normalizedUser;
  }

  public async updateUserProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<UserProfile | null> {
    const user = this.data.users[userId];
    if (!user) return null;

    const updatedProfile: UserProfile = {
      ...user.profile,
      ...updates,
    };
    const updatedUser: UserRecord = {
      ...user,
      username: updates.username ? updates.username : user.username,
      profile: updatedProfile,
    };

    if (isPostgresConfigured()) {
      await upsertUserToPostgres(updatedUser);
    }
    this.data.users[userId] = updatedUser;
    this.save();
    return updatedUser.profile;
  }

  public async updateUserPassword(
    userId: string,
    newPasswordHash: string
  ): Promise<UserRecord | null> {
    const user = this.data.users[userId];
    if (!user) return null;

    const updatedUser: UserRecord = {
      ...user,
      passwordHash: newPasswordHash,
      tokenVersion: (user.tokenVersion ?? 1) + 1,
      profile: { ...user.profile },
    };

    if (isPostgresConfigured()) {
      await upsertUserToPostgres(updatedUser);
    }
    this.data.users[userId] = updatedUser;
    this.save();
    return updatedUser;
  }

  public getAllUsers(): UserRecord[] {
    return Object.values(this.data.users);
  }

  public async toggleUserBan(userId: string): Promise<boolean> {
    const user = this.data.users[userId];
    if (!user) return false;

    const updatedUser: UserRecord = {
      ...user,
      isBanned: !user.isBanned,
      profile: { ...user.profile },
    };

    if (isPostgresConfigured()) {
      await upsertUserToPostgres(updatedUser);
    }
    this.data.users[userId] = updatedUser;
    this.save();
    return !!updatedUser.isBanned;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    if (!this.data.users[userId]) return false;
    if (isPostgresConfigured()) {
      await deleteUserFromPostgres(userId);
    }
    delete this.data.users[userId];
    this.save();
    return true;
  }

  public async setUserRole(userId: string, role: 'user' | 'admin'): Promise<boolean> {
    const user = this.data.users[userId];
    if (!user) return false;

    const updatedUser: UserRecord = {
      ...user,
      role,
      profile: { ...user.profile, role },
    };

    if (isPostgresConfigured()) {
      await upsertUserToPostgres(updatedUser);
    }
    this.data.users[userId] = updatedUser;
    this.save();
    return true;
  }

  // --- PASSWORD RESET TOKENS ---
  public async createPasswordResetToken(
    userId: string,
    rawToken: string,
    expiresInMs: number = 30 * 60 * 1000
  ): Promise<PasswordResetTokenRecord> {
    const nowMs = Date.now();
    const createdAtIso = new Date(nowMs).toISOString();
    const expiresAtIso = new Date(nowMs + expiresInMs).toISOString();
    const tokenHash = hashResetToken(rawToken);
    const id = `prt_${nowMs}_${Math.random().toString(36).substring(2, 8)}`;

    if (isPostgresConfigured()) {
      await createPasswordResetTokenToPostgres({
        id,
        userId,
        tokenHash,
        expiresAtIso,
        createdAtIso,
      });
    }

    // Invalidate previous unused tokens in memory cache
    for (const existing of this.memoryResetTokens.values()) {
      if (existing.userId === userId && !existing.usedAt && !existing.invalidatedAt) {
        existing.invalidatedAt = createdAtIso;
      }
    }

    const record: PasswordResetTokenRecord = {
      id,
      userId,
      tokenHash,
      expiresAt: expiresAtIso,
      usedAt: null,
      invalidatedAt: null,
      createdAt: createdAtIso,
    };
    this.memoryResetTokens.set(tokenHash, record);
    return record;
  }

  public async invalidatePasswordResetTokenById(tokenId: string): Promise<void> {
    if (isPostgresConfigured()) {
      await invalidatePasswordResetTokenInPostgres(tokenId);
    }
    const nowIso = new Date().toISOString();
    for (const existing of this.memoryResetTokens.values()) {
      if (existing.id === tokenId && !existing.usedAt && !existing.invalidatedAt) {
        existing.invalidatedAt = nowIso;
      }
    }
  }

  public async consumePasswordResetToken(
    rawToken: string,
    newPasswordPlain: string,
    options?: {
      nowIso?: string;
      beforeCommitHook?: (client: QueryableClient) => Promise<void>;
    }
  ): Promise<{
    success: boolean;
    reason?: 'invalid' | 'expired' | 'used';
    userId?: string;
  }> {
    const tokenHash = hashResetToken(rawToken);
    const nowIso = options?.nowIso || new Date().toISOString();
    const newPasswordHash = bcrypt.hashSync(newPasswordPlain, bcrypt.genSaltSync(10));

    if (isPostgresConfigured()) {
      const pgResult = await consumePasswordResetTokenAndUpdatePasswordInPostgres({
        tokenHash,
        newPasswordHash,
        nowIso,
        beforeCommitHook: options?.beforeCommitHook,
      });

      if (!pgResult.success || !pgResult.userId) {
        return { success: false, reason: pgResult.reason || 'invalid' };
      }

      // Only AFTER PostgreSQL COMMIT succeeded do we update in-memory user & token cache
      const memUser = this.data.users[pgResult.userId];
      if (memUser) {
        memUser.passwordHash = newPasswordHash;
        memUser.tokenVersion = pgResult.newTokenVersion ?? (memUser.tokenVersion ?? 1) + 1;
      }
      const memToken = this.memoryResetTokens.get(tokenHash);
      if (memToken) {
        memToken.usedAt = nowIso;
      }
      return { success: true, userId: pgResult.userId };
    }

    // Fallback JSON / Memory mode (pentru development & AI Studio Preview)
    const tokenRec = this.memoryResetTokens.get(tokenHash);
    if (!tokenRec) {
      return { success: false, reason: 'invalid' };
    }
    if (tokenRec.usedAt || tokenRec.invalidatedAt) {
      return { success: false, reason: 'used' };
    }
    if (new Date(tokenRec.expiresAt).getTime() <= new Date(nowIso).getTime()) {
      return { success: false, reason: 'expired' };
    }
    const user = this.data.users[tokenRec.userId];
    if (!user) {
      return { success: false, reason: 'invalid' };
    }

    if (options?.beforeCommitHook) {
      await options.beforeCommitHook({
        query: async () => ({ rows: [] }),
      });
    }

    tokenRec.usedAt = nowIso;
    for (const other of this.memoryResetTokens.values()) {
      if (other.userId === user.id && other.id !== tokenRec.id && !other.usedAt && !other.invalidatedAt) {
        other.invalidatedAt = nowIso;
      }
    }
    user.passwordHash = newPasswordHash;
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    this.save();
    return { success: true, userId: user.id };
  }

  // --- QUESTIONS ---
  public getAllQuestions(): Question[] {
    return this.data.questions;
  }

  public async addQuestion(question: Question): Promise<Question> {
    // V9.1/V9.2: Întrebările nou create au reviewStatus = 'draft' în mod implicit
    const normalized: Question = {
      ...question,
      reviewStatus: question.reviewStatus || 'draft',
      verified: question.reviewStatus === 'approved',
      factKey: question.factKey || `fact_${question.category || 'cg'}_${question.id}`,
    };
    if (isPostgresConfigured()) {
      await upsertQuestionToPostgres(normalized);
    }
    this.data.questions.push(normalized);
    this.save();
    return normalized;
  }

  public async addQuestionsBatch(questions: Question[]): Promise<Question[]> {
    const normalizedList: Question[] = questions.map((q) => ({
      ...q,
      reviewStatus: q.reviewStatus || 'draft',
      verified: q.reviewStatus === 'approved',
      factKey: q.factKey || `fact_${q.category || 'cg'}_${q.id}`,
    }));
    if (isPostgresConfigured()) {
      await seedQuestionsBatchToPostgres(normalizedList);
    }
    this.data.questions.push(...normalizedList);
    this.save();
    return normalizedList;
  }

  public async updateQuestion(id: string, updates: Partial<Question>): Promise<Question | null> {
    const idx = this.data.questions.findIndex((q) => q.id === id);
    if (idx === -1) return null;
    const merged: Question = {
      ...this.data.questions[idx],
      ...updates,
    };
    if (updates.reviewStatus) {
      merged.verified = updates.reviewStatus === 'approved';
    }
    if (isPostgresConfigured()) {
      await upsertQuestionToPostgres(merged);
    }
    this.data.questions[idx] = merged;
    this.save();
    return merged;
  }

  public async deleteQuestion(id: string): Promise<boolean> {
    const idx = this.data.questions.findIndex((q) => q.id === id);
    if (idx === -1) return false;
    if (isPostgresConfigured()) {
      await deleteQuestionFromPostgres(id);
    }
    this.data.questions.splice(idx, 1);
    this.save();
    return true;
  }

  // --- GAMES ---
  public async recordGame(game: GameRecord): Promise<void> {
    if (isPostgresConfigured()) {
      await insertGameToPostgres(game);
    }
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

  public async sendFriendRequest(
    requesterId: string,
    recipientId: string
  ): Promise<FriendRecord | null> {
    if (requesterId === recipientId) return null;
    if (!this.findUserById(requesterId) || !this.findUserById(recipientId)) {
      return null;
    }
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

    if (isPostgresConfigured()) {
      await createFriendRequestWithNotificationToPostgres(record, notif);
    }

    this.data.friends.push(record);
    this.data.notifications.unshift(notif);
    if (this.data.notifications.length > 500) {
      this.data.notifications.pop();
    }
    this.save();
    return record;
  }

  public async respondFriendRequest(requestId: string, accept: boolean): Promise<boolean> {
    const idx = this.data.friends.findIndex((f) => f.id === requestId);
    if (idx === -1) return false;
    if (accept) {
      const updatedFriend: FriendRecord = {
        ...this.data.friends[idx],
        status: 'accepted',
      };
      if (isPostgresConfigured()) {
        await upsertFriendToPostgres(updatedFriend);
      }
      this.data.friends[idx] = updatedFriend;
    } else {
      if (isPostgresConfigured()) {
        await deleteFriendFromPostgres(requestId);
      }
      this.data.friends.splice(idx, 1);
    }
    this.save();
    return true;
  }

  // --- NOTIFICATIONS ---
  public getNotifications(userId: string): NotificationRecord[] {
    return this.data.notifications.filter((n) => n.userId === userId).slice(0, 30);
  }

  public async addNotification(notif: NotificationRecord): Promise<void> {
    if (isPostgresConfigured()) {
      await upsertNotificationToPostgres(notif);
    }
    this.data.notifications.unshift(notif);
    if (this.data.notifications.length > 500) {
      this.data.notifications.pop();
    }
    this.save();
  }

  public async markNotificationAsRead(id: string, userId: string): Promise<boolean> {
    const notif = this.data.notifications.find((n) => n.id === id && n.userId === userId);
    if (!notif) return false;
    const updatedNotif: NotificationRecord = {
      ...notif,
      isRead: true,
    };
    if (isPostgresConfigured()) {
      await upsertNotificationToPostgres(updatedNotif);
    }
    notif.isRead = true;
    this.save();
    return true;
  }

  // --- AUDIT LOGS ---
  public async recordAuditLog(params: {
    adminId: string;
    adminUsername: string;
    action: string;
    targetType: string;
    targetId: string;
    details?: Record<string, any>;
  }): Promise<AuditLogRecord> {
    const entry: AuditLogRecord = {
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      adminId: params.adminId,
      adminUsername: params.adminUsername,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      details: params.details || {},
      createdAt: new Date().toISOString(),
    };
    if (isPostgresConfigured()) {
      await insertAuditLogToPostgres(entry);
    }
    if (!Array.isArray(this.data.auditLogs)) {
      this.data.auditLogs = [];
    }
    this.data.auditLogs.unshift(entry);
    if (this.data.auditLogs.length > 200) {
      this.data.auditLogs.pop();
    }
    this.save();
    return entry;
  }

  public getAuditLogs(limit: number = 100): AuditLogRecord[] {
    if (!Array.isArray(this.data.auditLogs)) {
      this.data.auditLogs = [];
    }
    return this.data.auditLogs.slice(0, limit);
  }
}

export const db = new Database();
