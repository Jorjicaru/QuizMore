import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UserProfile } from '../types/game';
import { sound } from '../services/audio';
import {
  User,
  Shield,
  Trophy,
  Flag,
  Award,
  KeyRound,
  Check,
  AlertCircle,
  History,
} from 'lucide-react';

interface ProfileViewProps {
  currentUser: UserProfile;
  onUpdateUser: (user: UserProfile) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ currentUser, onUpdateUser }) => {
  const [usernameInput, setUsernameInput] = useState(currentUser.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [myHistory, setMyHistory] = useState<any[]>([]);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await api.getMyGamesHistory();
        setMyHistory(res.history || []);
      } catch (e) {
        // ignore
      }
    };
    fetchHistory();
  }, []);

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput || usernameInput === currentUser.username) return;
    setLoading(true);
    setMessage(null);
    try {
      sound.playClick();
      const res = await api.updateProfile({ username: usernameInput });
      onUpdateUser(res.user);
      setMessage({ text: 'Numele de utilizator a fost actualizat cu succes!', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) return;
    setLoading(true);
    setMessage(null);
    try {
      sound.playClick();
      const res = await api.changePassword(currentPassword, newPassword);
      setMessage({ text: res.message, type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn text-left">
      {/* Profile Card Header */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-6">
          {/* Avatar Icon */}
          <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-amber-500/50 bg-slate-950 text-4xl shadow-2xl">
            {currentUser.avatar === 'av_stefan' ? '👑' : currentUser.avatar === 'av_regina' ? '💎' : '🗡️'}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-2xl font-black text-slate-100">{currentUser.username}</h2>
              {currentUser.role === 'admin' && (
                <span className="rounded bg-purple-500/20 border border-purple-500/40 px-2 py-0.5 text-[10px] font-bold text-purple-300">
                  ADMIN
                </span>
              )}
            </div>
            <p className="text-xs text-amber-400 font-semibold mt-0.5">{currentUser.title || 'Jucător CONQUIZ'}</p>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">{currentUser.email}</p>

          </div>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3.5 text-xs font-semibold ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/30 bg-red-500/10 text-red-300'
          }`}
        >
          {message.type === 'success' ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
          <div className="text-xs text-slate-400">Rating Competitiv</div>
          <div className="mt-1 font-mono text-2xl font-black text-amber-400">{currentUser.rating}</div>
          <div className="text-[10px] text-slate-500">Puncte Elo</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
          <div className="text-xs text-slate-400">Victorii / Meciuri</div>
          <div className="mt-1 font-mono text-2xl font-black text-emerald-400">
            {currentUser.wins} <span className="text-xs font-normal text-slate-400">/ {currentUser.matchesPlayed}</span>
          </div>
          <div className="text-[10px] text-slate-500">Rată Câștig: {currentUser.matchesPlayed > 0 ? Math.round((currentUser.wins / currentUser.matchesPlayed) * 100) : 0}%</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
          <div className="text-xs text-slate-400">Teritorii Cucerite</div>
          <div className="mt-1 font-mono text-2xl font-black text-blue-400">{currentUser.territoriesConquered}</div>
          <div className="text-[10px] text-slate-500">Pe Harta României</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-center">
          <div className="text-xs text-slate-400">Scor Maxim</div>
          <div className="mt-1 font-mono text-2xl font-black text-purple-400">{currentUser.highestScore}</div>
          <div className="text-[10px] text-slate-500">Puncte într-un Meci</div>
        </div>
      </div>

      {/* Account Settings Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Change Username Form */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
            Schimbă Numele de Utilizator
          </h3>
          <form onSubmit={handleUpdateUsername} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Nume Nou</label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || usernameInput === currentUser.username}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition"
            >
              Salvează Numele
            </button>
          </form>
        </div>

        {/* Change Password Form */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
            Schimbă Parola
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Parola Curentă</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Parola Nouă</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="minim 10 caractere"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-slate-100 focus:border-amber-500 focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !currentPassword || !newPassword}
              className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition"
            >
              Actualizează Parola
            </button>
          </form>
        </div>
      </div>

      {/* Match History */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
        <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-4">
          <History className="h-4 w-4 text-amber-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Istoricul Meciurilor Recente
          </h3>
        </div>

        {myHistory.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-500">
            Niciun meci înregistrat încă. Creează o cameră sau intră într-un meci.
          </div>
        ) : (
          <div className="space-y-2">
            {myHistory.map((game) => {
              const mySummary = game.playersSummary.find((p: any) => p.userId === currentUser.id);
              const won = mySummary?.isWinner;

              return (
                <div
                  key={game.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className={`rounded-lg px-2 py-1 font-bold text-[10px] ${won ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
                      {won ? 'VICTORIE' : 'ÎNFRÂNGERE'}
                    </span>
                    <div>
                      <span className="font-bold text-slate-200">
                        {game.playerCount} Jucători &bull; Câștigător: {game.winnerUsername || 'Anonim'}
                      </span>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {new Date(game.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="font-mono font-bold text-amber-400">
                    {mySummary ? `${mySummary.score} pct` : '-'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
