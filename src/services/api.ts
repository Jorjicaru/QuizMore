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
    if (!res.ok) {
      throw new Error(data.error || 'A apărut o eroare de comunicare cu serverul.');
    }

    return data as T;
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

  // Games & Rooms
  async getPublicRooms() {
    return this.request<{ rooms: Array<{ roomId: string; roomName: string; playersCount: number; maxPlayers: number; phase: string }> }>('/api/games/rooms');
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

  async getAdminStats() {
    return this.request<{ totalUsers: number; bannedUsers: number; totalGames: number; totalQuestions: number; activeRoomsCount: number }>('/api/admin/stats');
  },
};
