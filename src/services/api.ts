import { UserProfile, Question } from '../types/game';

const TOKEN_KEY = 'conquiz_token';

export const api = {
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
  },

  clearToken(): void {
    localStorage.removeItem(TOKEN_KEY);
  },

  async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data?.maintenance === true && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('conquiz:maintenance', {
          detail: { message: data.error || 'Aplicația este momentan în mentenanță.' },
        })
      );
    }
    if (!res.ok) {
      throw new Error(data.error || 'A apărut o eroare de comunicare cu serverul.');
    }

    return data as T;
  },

  async getSystemStatus(): Promise<{ ok: boolean; maintenance: boolean; message: string | null; timestamp: string }> {
    const res = await fetch('/api/status');
    const data = await res.json().catch(() => ({ ok: true, maintenance: false, message: null, timestamp: new Date().toISOString() }));
    if (data?.maintenance === true && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('conquiz:maintenance', {
          detail: { message: data.message || 'Aplicația este momentan în mentenanță.' },
        })
      );
    }
    return data;
  },

  // Auth
  async login(loginIdentifier: string, password: string) {
    const res = await this.request<{ token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ loginIdentifier, password }),
    });
    this.setToken(res.token);
    return res;
  },

  async register(username: string, email: string, password: string, confirmPassword: string) {
    const res = await this.request<{ token: string; user: UserProfile }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password, confirmPassword }),
    });
    this.setToken(res.token);
    return res;
  },

  async loginAsGuest() {
    const res = await this.request<{ token: string; user: UserProfile }>('/api/auth/guest', {
      method: 'POST',
    });
    this.setToken(res.token);
    return res;
  },

  async getMe() {
    return this.request<{ user: UserProfile; unreadNotificationsCount: number }>('/api/auth/me');
  },

  async updateProfile(updates: Partial<UserProfile>) {
    return this.request<{ user: UserProfile }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean; message: string }>('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  async forgotPassword(email: string) {
    return this.request<{ success: boolean; message: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, newPassword: string, confirmPassword: string) {
    return this.request<{ success: boolean; message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword, confirmPassword }),
    });
  },

  // Games & Rooms
  async getPublicRooms() {
    return this.request<{ rooms: Array<{ roomId: string; roomName: string; playersCount: number; maxPlayers: number; phase: string }> }>('/api/games/rooms');
  },

  async getMyActiveRoom() {
    return this.request<{
      activeRoom: {
        roomId: string;
        roomName: string;
        phase: string;
        isConnected: boolean;
        botControlled: boolean;
      } | null;
    }>('/api/games/my-active-room');
  },

  async getLeaderboard(type: 'rating' | 'wins' | 'territories' | 'score' = 'rating') {
    return this.request<{ leaderboard: Array<UserProfile & { rank: number }> }>(`/api/games/leaderboard?type=${type}`);
  },

  async getGamesHistory() {
    return this.request<{ history: any[] }>('/api/games/history');
  },

  async getMyGamesHistory() {
    return this.request<{ history: any[] }>('/api/games/my-history');
  },

  // Social
  async getFriends() {
    return this.request<{ friends: Array<{ friend: UserProfile; status: 'pending' | 'accepted'; isRequester: boolean; id: string }> }>('/api/social/friends');
  },

  async searchUsers(query: string) {
    return this.request<{ users: UserProfile[] }>(`/api/social/users/search?q=${encodeURIComponent(query)}`);
  },

  async sendFriendRequest(recipientId: string) {
    return this.request<{ success: boolean; message: string }>('/api/social/friends/request', {
      method: 'POST',
      body: JSON.stringify({ recipientId }),
    });
  },

  async respondFriendRequest(requestId: string, accept: boolean) {
    return this.request<{ success: boolean; message: string }>('/api/social/friends/respond', {
      method: 'POST',
      body: JSON.stringify({ requestId, accept }),
    });
  },

  async getNotifications() {
    return this.request<{ notifications: any[] }>('/api/social/notifications');
  },

  async markNotificationRead(id: string) {
    return this.request<{ success: boolean }>(`/api/social/notifications/${id}/read`, {
      method: 'POST',
    });
  },

  // Questions & Admin
  async getQuestions(filter?: { category?: string; difficulty?: string; type?: string; search?: string }) {
    const params = new URLSearchParams(filter as any).toString();
    return this.request<{ questions: Question[]; total: number }>(`/api/questions?${params}`);
  },

  async getQuestionsStats() {
    return this.request<{ total: number; byCategory: Record<string, number>; byDifficulty: Record<string, number>; byType: Record<string, number> }>('/api/questions/stats');
  },

  async createQuestion(question: Partial<Question>) {
    return this.request<{ success: boolean; question: Question }>('/api/questions', {
      method: 'POST',
      body: JSON.stringify(question),
    });
  },

  async updateQuestion(id: string, updates: Partial<Question>) {
    return this.request<{ success: boolean; question: Question }>(`/api/questions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteQuestion(id: string) {
    return this.request<{ success: boolean; message: string }>(`/api/questions/${id}`, {
      method: 'DELETE',
    });
  },

  async importQuestions(questions: Partial<Question>[]) {
    return this.request<{ success: boolean; message: string }>('/api/questions/import', {
      method: 'POST',
      body: JSON.stringify({ questions }),
    });
  },

  // Admin
  async getAdminUsers(search?: string) {
    return this.request<{ users: any[] }>(`/api/admin/users?search=${encodeURIComponent(search || '')}`);
  },

  async toggleUserBan(userId: string) {
    return this.request<{ success: boolean; isBanned: boolean; message: string }>(`/api/admin/users/${userId}/ban`, {
      method: 'POST',
    });
  },

  async setRole(userId: string, role: 'user' | 'admin') {
    return this.request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    });
  },

  async adjustUserStats(
    userId: string,
    payload: {
      rating?: number;
      wins?: number;
      losses?: number;
      matchesPlayed?: number;
      highestScore?: number;
      title?: string;
      reason?: string;
    }
  ) {
    return this.request<{ success: boolean; message: string; user: any }>(
      `/api/admin/users/${encodeURIComponent(userId)}/adjust-stats`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  async getAdminRooms() {
    return this.request<{ rooms: any[] }>('/api/admin/rooms');
  },

  async closeAdminRoom(roomId: string, reason?: string) {
    return this.request<{ success: boolean; message: string }>(
      `/api/admin/rooms/${encodeURIComponent(roomId)}/close`,
      {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }
    );
  },

  async getAdminAuditLogs(limit = 100) {
    return this.request<{ logs: any[] }>(`/api/admin/audit-logs?limit=${limit}`);
  },

  async getAdminStats() {
    return this.request<{
      totalUsers: number;
      bannedUsers: number;
      totalGames: number;
      totalQuestions: number;
      approvedQuestions: number;
      activeRoomsCount: number;
      waitingRoomsCount: number;
      finishedRoomsCount: number;
      roomsByPhase: Record<string, number>;
      onlineAuthenticatedCount: number;
      activeSocketsCount: number;
      onlineUserIds: string[];
      disconnectedPlayersCount: number;
      botControlledPlayersCount: number;
      rooms: Array<{
        roomId: string;
        roomName: string;
        phase: string;
        isPrivate: boolean;
        round: number;
        maxRounds: number;
        playersCount: number;
        maxPlayers: number;
        humanPlayersCount: number;
        connectedHumansCount: number;
        disconnectedHumansCount: number;
        botTakeoverCount: number;
        aiBotsCount: number;
      }>;
      health: {
        storageMode: string;
        postgresConnected: boolean;
        emailConfigured: boolean;
        maintenanceMode: boolean;
        recentErrors: Array<{ id: string; timestamp: string; source: string; message: string }>;
        uptimeSeconds: number;
        serverTime: string;
      };
    }>('/api/admin/stats');
  },
};
