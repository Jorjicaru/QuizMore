import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { UserProfile } from '../types/game';
import { sound } from '../services/audio';
import {
  Users,
  UserPlus,
  Check,
  X,
  Search,
  Swords,
  Sparkles,
  Castle,
  Bell,
  Eye,
} from 'lucide-react';

interface FriendsViewProps {
  currentUser: UserProfile;
  onChallengeFriend?: (friend: UserProfile) => void;
  onJoinRoomByCode?: (roomId: string) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  currentUser,
  onChallengeFriend,
  onJoinRoomByCode,
}) => {
  const [friends, setFriends] = useState<
    Array<{
      friend: UserProfile & { onlineStatus?: 'online' | 'in_room' | 'offline'; activeRoomId?: string | null };
      status: 'pending' | 'accepted';
      isRequester: boolean;
      id: string;
    }>
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<UserProfile & { onlineStatus?: 'online' | 'in_room' | 'offline'; activeRoomId?: string | null }>
  >([]);
  const [suggestedUsers, setSuggestedUsers] = useState<
    Array<UserProfile & { onlineStatus?: 'online' | 'in_room' | 'offline'; activeRoomId?: string | null }>
  >([]);
  const [gameInvites, setGameInvites] = useState<
    Array<{ id: string; title: string; message: string; roomId?: string; createdAt: string }>
  >([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchFriendsAndSuggestions = useCallback(async () => {
    try {
      const [friendsRes, suggestedRes, notifsRes] = await Promise.all([
        api.getFriends(),
        api.searchUsers(''),
        api.getNotifications(),
      ]);
      setFriends(friendsRes.friends || []);
      setSuggestedUsers(suggestedRes.users || []);
      const invites = (notifsRes.notifications || [])
        .filter((n: any) => n.type === 'game_invite')
        .map((n: any) => {
          const match = String(n.message || '').match(/#([A-Z0-9]{4,8})/i);
          return {
            id: n.id,
            title: n.title,
            message: n.message,
            roomId: match ? match[1].toUpperCase() : undefined,
            createdAt: n.createdAt,
          };
        });
      setGameInvites(invites);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchFriendsAndSuggestions();
  }, [fetchFriendsAndSuggestions]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearchLoading(true);
    try {
      const res = await api.searchUsers(searchQuery.trim());
      setSearchResults(res.users || []);
    } catch {
      // ignore
    } finally {
      setSearchLoading(false);
    }
  };

  const handleQuickBefriend = async (targetUserId?: string) => {
    try {
      sound.playClick();
      setQuickLoading(true);
      const res = await api.quickBefriend(targetUserId);
      setMessage(res.message);
      await fetchFriendsAndSuggestions();
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setQuickLoading(false);
    }
  };

  const handleSendRequest = async (recipientId: string) => {
    try {
      sound.playClick();
      const res = await api.sendFriendRequest(recipientId);
      setMessage(res.message);
      await fetchFriendsAndSuggestions();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleRespond = async (requestId: string, accept: boolean) => {
    try {
      sound.playClick();
      const res = await api.respondFriendRequest(requestId, accept);
      setMessage(res.message);
      await fetchFriendsAndSuggestions();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const acceptedFriends = friends.filter((f) => f.status === 'accepted');
  const pendingRequests = friends.filter((f) => f.status === 'pending');
  const existingFriendIds = new Set(friends.map((f) => f.friend.id));
  const filteredSuggestions = suggestedUsers.filter(
    (u) => u.id !== currentUser.id && !existingFriendIds.has(u.id)
  );

  const renderPresenceBadge = (status?: 'online' | 'in_room' | 'offline', activeRoomId?: string | null) => {
    if (status === 'in_room') {
      return (
        <span
          data-testid="friend-status-in-room"
          className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300"
        >
          <Castle className="h-2.5 w-2.5" /> În cameră {activeRoomId ? `#${activeRoomId}` : ''}
        </span>
      );
    }
    if (status === 'online') {
      return (
        <span
          data-testid="friend-status-online"
          className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Online
        </span>
      );
    }
    return (
      <span
        data-testid="friend-status-offline"
        className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800/80 px-2 py-0.5 text-[10px] font-semibold text-slate-400"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Offline
      </span>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-4xl mx-auto animate-fadeIn text-left">
      {/* Banner */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-7 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
              <Users className="h-4 w-4" /> Alianțe & Prieteni
            </div>
            <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-black text-slate-100">
              Comunitatea CONQUIZ
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Adaugă prieteni, vezi în timp real dacă sunt online sau în cameră și provoacă-i la duel 1v1!
            </p>
          </div>

          <button
            type="button"
            data-testid="quick-befriend-btn"
            onClick={() => handleQuickBefriend()}
            disabled={quickLoading}
            className="flex items-center gap-2 rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition cursor-pointer"
          >
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span>{quickLoading ? 'Se adaugă...' : 'Împrietenire Rapidă (Companion Test)'}</span>
          </button>
        </div>

        {/* User Search Form */}
        <form onSubmit={handleSearch} className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              data-testid="friends-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută jucători după nume de utilizator..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            data-testid="friends-search-btn"
            disabled={searchLoading}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition cursor-pointer"
          >
            {searchLoading ? 'Caută...' : 'Caută'}
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">Rezultate Căutare:</div>
            {searchResults.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🗡️</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-200">{user.username}</span>
                      {renderPresenceBadge(user.onlineStatus, user.activeRoomId)}
                    </div>
                    <div className="text-[10px] text-amber-400">{user.rating} Elo</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendRequest(user.id)}
                    className="flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Trimite Cerere
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && (
        <div
          data-testid="friends-feedback-banner"
          className="flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs font-semibold text-amber-200"
        >
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-amber-300 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Active Game Invites Received */}
      {gameInvites.length > 0 && (
        <div
          data-testid="friends-game-invites"
          className="rounded-3xl border border-amber-500/40 bg-amber-950/20 p-5"
        >
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300 mb-3">
            <Bell className="h-4 w-4 text-amber-400" /> Invitații la Joc Primite ({gameInvites.length})
          </h3>
          <div className="space-y-2">
            {gameInvites.slice(0, 4).map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-slate-950/85 p-3"
              >
                <div>
                  <div className="text-xs font-bold text-amber-200">{inv.title}</div>
                  <div className="text-[11px] text-slate-300">{inv.message}</div>
                </div>
                {inv.roomId && onJoinRoomByCode && (
                  <button
                    type="button"
                    data-testid={`accept-game-invite-${inv.roomId}`}
                    onClick={() => {
                      sound.playClick();
                      onJoinRoomByCode(inv.roomId!);
                    }}
                    className="rounded-xl bg-amber-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition cursor-pointer"
                  >
                    Acceptă & Intră (#{inv.roomId})
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-4">
            Cereri de Prietenie în Așteptare ({pendingRequests.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendingRequests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">👑</span>
                  <div>
                    <div className="text-xs font-bold text-slate-200">{req.friend.username}</div>
                    <div className="text-[10px] text-slate-400">
                      {req.isRequester ? 'Cerere expediată de tine' : 'Ți-a trimis o cerere'}
                    </div>
                  </div>
                </div>

                {!req.isRequester ? (
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      data-testid={`accept-friend-${req.id}`}
                      onClick={() => handleRespond(req.id, true)}
                      title="Acceptă"
                      className="p-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 cursor-pointer"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      data-testid={`decline-friend-${req.id}`}
                      onClick={() => handleRespond(req.id, false)}
                      title="Refuză"
                      className="p-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] font-mono text-slate-500">În așteptare</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Accepted Friends List */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4">
          Lista Ta de Prieteni ({acceptedFriends.length})
        </h3>

        {acceptedFriends.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Nu ai adăugat niciun prieten încă. Apasă pe{' '}
            <strong className="text-emerald-300">Împrietenire Rapidă</strong> sau caută un jucător mai sus!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {acceptedFriends.map((f) => (
              <div
                key={f.id}
                data-testid={`friend-card-${f.friend.username}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/85 p-3.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <span className="text-2xl">🗡️</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-100 truncate">
                        {f.friend.username}
                      </span>
                      {renderPresenceBadge(f.friend.onlineStatus, f.friend.activeRoomId)}
                    </div>
                    <div className="text-[10px] text-amber-400 mt-0.5">
                      {f.friend.title || 'Jucător'} &bull; {f.friend.rating} Elo
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {f.friend.onlineStatus === 'in_room' && f.friend.activeRoomId && onJoinRoomByCode && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        onJoinRoomByCode(f.friend.activeRoomId!);
                      }}
                      title="Intră sau urmărește ca Spectator"
                      className="flex items-center gap-1 rounded-lg bg-sky-500/15 border border-sky-500/40 px-2.5 py-1.5 text-[11px] font-bold text-sky-300 hover:bg-sky-500/25 cursor-pointer"
                    >
                      <Eye className="h-3 w-3" /> Intră
                    </button>
                  )}

                  {onChallengeFriend && (
                    <button
                      type="button"
                      data-testid={`challenge-friend-btn-${f.friend.username}`}
                      onClick={() => {
                        sound.playClick();
                        onChallengeFriend(f.friend);
                      }}
                      title="Provoacă la Duel 1v1 sau Invită în Cameră"
                      className="flex items-center gap-1 rounded-lg bg-red-500/15 border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-500/25 cursor-pointer"
                    >
                      <Swords className="h-3.5 w-3.5" /> Provoacă 1v1
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suggested Players for Easy Discovery */}
      {filteredSuggestions.length > 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/30 p-5 sm:p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Jucători Sugerați în CONQUIZ
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredSuggestions.slice(0, 6).map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-3"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-lg">🛡️</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-200 truncate">{u.username}</span>
                      {renderPresenceBadge(u.onlineStatus, u.activeRoomId)}
                    </div>
                    <div className="text-[10px] text-amber-400">{u.rating} Elo</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSendRequest(u.id)}
                  className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1.5 text-[11px] font-bold text-amber-300 hover:bg-amber-500/25 cursor-pointer shrink-0"
                >
                  <UserPlus className="h-3 w-3" /> Adaugă
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
