import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { Question, UserProfile } from '../src/types/game';
import { INITIAL_QUESTIONS } from './questionsData';

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

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = this.loadDatabase();
  }

  private addConfiguredAdmin(data: DatabaseSchema): boolean {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const username = String(process.env.ADMIN_USERNAME || 'conquiz-admin').trim();
    const password = String(process.env.ADMIN_PASSWORD || '');
    if (!email || !password || Object.values(data.users || {}).some(user => user.role === 'admin')) return false;
    if (email.endsWith('@example.com') || email.endsWith('@domeniu.ro') || /adresa-ta/i.test(email) || /replace|change-me|your-password|inlocuieste/i.test(password)) {
      throw new Error('Înlocuiește valorile demonstrative ADMIN_EMAIL și ADMIN_PASSWORD din .env cu propriile date înainte de pornire.');
    }
    if (password.length < 20 || password.length > 128) {
      throw new Error('ADMIN_PASSWORD trebuie să aibă între 20 și 128 de caractere aleatorii.');
    }
    if (Object.values(data.users || {}).some(user => user.email.toLowerCase() === email || user.username.toLowerCase() === username.toLowerCase())) {
      throw new Error('ADMIN_EMAIL sau ADMIN_USERNAME este deja folosit de un cont existent.');
    }
    const id = `usr_admin_${Date.now()}`;
    const createdAt = new Date().toISOString();
    const profile: UserProfile = {
      id, username, email, role: 'admin', avatar: 'av_razes', title: 'Administrator',
      rating: 1200, matchesPlayed: 0, wins: 0, losses: 0,
      territoriesConquered: 0, correctAnswersTotal: 0, highestScore: 0, createdAt,
    };
    data.users[id] = {
      id, username, email, passwordHash: bcrypt.hashSync(password, bcrypt.genSaltSync(12)),
      role: 'admin', createdAt, profile,
    };
    return true;
  }

  private loadDatabase(): DatabaseSchema {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        const originalSnapshot = JSON.stringify(parsed);
        // Add newly shipped seed questions without overwriting user-created questions.
        if (!Array.isArray(parsed.questions)) parsed.questions = [];
        const existingIds = new Set(parsed.questions.map((q: Question) => q.id));
        const originalQuestionCount = parsed.questions.length;
        for (const seed of INITIAL_QUESTIONS) {
          if (!existingIds.has(seed.id)) parsed.questions.push(seed);
        }
        parsed.users ||= {};
        parsed.games ||= [];
        parsed.friends ||= [];
        parsed.notifications ||= [];
        parsed.notifications = parsed.notifications.filter((notification: any) => ['friend_request', 'game_invite', 'system'].includes(notification.type));
        // Remove legacy progression/shop data from older database snapshots.
        delete parsed.achievements;
        delete parsed.userAchievements;
        delete parsed.dailyMissions;
        delete parsed.userMissions;
        delete parsed.shopItems;
        delete parsed.userInventory;
        for (const user of Object.values(parsed.users || {}) as any[]) {
          if (user.profile) {
            delete user.profile.level;
            delete user.profile.xp;
            delete user.profile.coins;
          }
        }
        const adminAdded = this.addConfiguredAdmin(parsed as DatabaseSchema);
        if (adminAdded || parsed.questions.length !== originalQuestionCount || JSON.stringify(parsed) !== originalSnapshot) {
          fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
        }
        return parsed as DatabaseSchema;
      } catch (e) {
        console.error('Error reading db file, re-initializing', e);
      }
    }

    // Empty default database. Never ship pre-created public admin/demo credentials.
    const defaultData: DatabaseSchema = {
      users: {},
      questions: INITIAL_QUESTIONS,
      games: [],
      friends: [],
      notifications: [],
    };

    this.addConfiguredAdmin(defaultData);
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
    return defaultData;
  }

  public save(): void {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
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
      u => u.username.toLowerCase() === username.toLowerCase()
    );
  }

  public findUserByEmail(email: string): UserRecord | undefined {
    return Object.values(this.data.users).find(
      u => u.email.toLowerCase() === email.toLowerCase()
    );
  }

  public createUser(user: UserRecord): UserRecord {
    this.data.users[user.id] = user;
    this.save();
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
    return !!user.isBanned;
  }

  public setUserRole(userId: string, role: 'user' | 'admin'): boolean {
    const user = this.data.users[userId];
    if (!user) return false;
    user.role = role;
    user.profile.role = role;
    this.save();
    return true;
  }

  // --- QUESTIONS ---
  public getAllQuestions(): Question[] {
    return this.data.questions;
  }

  public addQuestion(question: Question): Question {
    this.data.questions.push(question);
    this.save();
    return question;
  }

  public updateQuestion(id: string, updates: Partial<Question>): Question | null {
    const idx = this.data.questions.findIndex(q => q.id === id);
    if (idx === -1) return null;
    this.data.questions[idx] = { ...this.data.questions[idx], ...updates };
    this.save();
    return this.data.questions[idx];
  }

  public deleteQuestion(id: string): boolean {
    const len = this.data.questions.length;
    this.data.questions = this.data.questions.filter(q => q.id !== id);
    if (this.data.questions.length !== len) {
      this.save();
      return true;
    }
    return false;
  }

  // --- GAMES ---
  public recordGame(game: GameRecord): void {
    this.data.games.unshift(game);
    // Keep max 200 game records
    if (this.data.games.length > 200) {
      this.data.games.pop();
    }
    this.save();
  }

  public getGamesHistory(limit: number = 20): GameRecord[] {
    return this.data.games.slice(0, limit);
  }

  public getUserGameHistory(userId: string): GameRecord[] {
    return this.data.games.filter(g =>
      g.playersSummary.some(p => p.userId === userId)
    );
  }

  // --- FRIENDS ---
  public getFriends(userId: string): Array<{ friend: UserProfile; status: 'pending' | 'accepted'; isRequester: boolean; id: string }> {
    const list: Array<{ friend: UserProfile; status: 'pending' | 'accepted'; isRequester: boolean; id: string }> = [];
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
      f => (f.requesterId === requesterId && f.recipientId === recipientId) ||
           (f.requesterId === recipientId && f.recipientId === requesterId)
    );
    if (exists) return null;

    const record: FriendRecord = {
      id: `fr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      requesterId,
      recipientId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    this.data.friends.push(record);
    this.addNotification({
      id: `notif_${Date.now()}`,
      userId: recipientId,
      title: 'Cerere de prietenie nouă',
      message: `${this.findUserById(requesterId)?.username || 'Un jucător'} ți-a trimis o cerere de prietenie!`,
      type: 'friend_request',
      isRead: false,
      createdAt: new Date().toISOString(),
    });
    this.save();
    return record;
  }

  public respondFriendRequest(requestId: string, accept: boolean): boolean {
    const idx = this.data.friends.findIndex(f => f.id === requestId);
    if (idx === -1) return false;
    if (accept) {
      this.data.friends[idx].status = 'accepted';
    } else {
      this.data.friends.splice(idx, 1);
    }
    this.save();
    return true;
  }

  // --- NOTIFICATIONS ---
  public getNotifications(userId: string): NotificationRecord[] {
    return this.data.notifications.filter(n => n.userId === userId).slice(0, 30);
  }

  public addNotification(notif: NotificationRecord): void {
    this.data.notifications.unshift(notif);
    if (this.data.notifications.length > 500) {
      this.data.notifications.pop();
    }
    this.save();
  }

  public markNotificationAsRead(id: string, userId: string): boolean {
    const notif = this.data.notifications.find(n => n.id === id && n.userId === userId);
    if (notif) {
      notif.isRead = true;
      this.save();
      return true;
    }
    return false;
  }


}

export const db = new Database();
