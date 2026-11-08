import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UserProfile } from '../types/game';
import { sound } from '../services/audio';
import { Users, UserPlus, Check, X, Search, Swords, Award, Shield } from 'lucide-react';

interface FriendsViewProps {
  currentUser: UserProfile;
  onChallengeFriend?: (friend: UserProfile) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({ currentUser, onChallengeFriend }) => {
  const [friends, setFriends] = useState<Array<{ friend: UserProfile; status: 'pending' | 'accepted'; isRequester: boolean; id: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const fetchFriends = async () => {
    try {
      const res = await api.getFriends();
      setFriends(res.friends || []);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    fetchFriends();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.length < 2) return;
    setSearchLoading(true);
    try {
      const res = await api.searchUsers(searchQuery.trim());
      setSearchResults(res.users || []);
    } catch (e) {
      // ignore
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSendRequest = async (recipientId: string) => {
    try {
      sound.playClick();
      const res = await api.sendFriendRequest(recipientId);
      setMessage(res.message);
      fetchFriends();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const handleRespond = async (requestId: string, accept: boolean) => {
    try {
      sound.playClick();
      const res = await api.respondFriendRequest(requestId, accept);
      setMessage(res.message);
      fetchFriends();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const acceptedFriends = friends.filter(f => f.status === 'accepted');
  const pendingRequests = friends.filter(f => f.status === 'pending');

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn text-left">
      {/* Banner */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
          <Users className="h-4 w-4" /> Alianțe & Prieteni
        </div>
        <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-black text-slate-100">
          Comunitatea CONQUIZ
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Adaugă prieteni, vezi când sunt online și provoacă-i la dueluri pe harta României.
        </p>

        {/* User Search Form */}
        <form onSubmit={handleSearch} className="mt-6 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută jucători după nume de utilizator..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={searchLoading || searchQuery.length < 2}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition"
          >
            {searchLoading ? 'Caută...' : 'Caută'}
          </button>
        </form>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/90 p-3 space-y-2">
            <div className="text-[11px] font-bold uppercase text-slate-400 mb-1">Rezultate Căutare:</div>
            {searchResults.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-900/60 border border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🗡️</span>
                  <div>
                    <div className="text-xs font-bold text-slate-200">{user.username}</div>
                    <div className="text-[10px] text-amber-400">{user.rating} Elo</div>
                  </div>
                </div>
                <button
                  onClick={() => handleSendRequest(user.id)}
                  className="flex items-center gap-1 rounded-lg bg-amber-500/20 border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Adaugă Prieten
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          {message}
        </div>
      )}

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-4">
            Cereri de Prietenie în Așteptare ({pendingRequests.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
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
                      onClick={() => handleRespond(req.id, true)}
                      title="Acceptă"
                      className="p-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleRespond(req.id, false)}
                      title="Refuză"
                      className="p-1.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg hover:bg-red-500/30"
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
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4">
          Lista Ta de Prieteni ({acceptedFriends.length})
        </h3>

        {acceptedFriends.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Nu ai adăugat niciun prieten încă. Folosește bara de căutare de mai sus!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {acceptedFriends.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <span className="text-2xl">🗡️</span>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-slate-950" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-100">{f.friend.username}</div>
                    <div className="text-[10px] text-amber-400">{f.friend.title || 'Jucător'}</div>
                  </div>
                </div>

                {onChallengeFriend && (
                  <button
                    onClick={() => {
                      sound.playClick();
                      onChallengeFriend(f.friend);
                    }}
                    title="Provoacă la Joc"
                    className="flex items-center gap-1 rounded-lg bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-xs font-bold text-red-400 hover:bg-red-500/20"
                  >
                    <Swords className="h-3.5 w-3.5" /> Luptă
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
