import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { UserProfile } from '../types/game';
import { Trophy, Award, Flag, Flame, Target, Sparkles, RefreshCw } from 'lucide-react';
import { sound } from '../services/audio';

export const LeaderboardView: React.FC = () => {
  const [tab, setTab] = useState<'rating' | 'wins' | 'territories' | 'score'>('rating');
  const [leaderboard, setLeaderboard] = useState<Array<UserProfile & { rank: number }>>([]);
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = async (type: 'rating' | 'wins' | 'territories' | 'score') => {
    setLoading(true);
    try {
      const res = await api.getLeaderboard(type);
      setLeaderboard(res.leaderboard || []);
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard(tab);
  }, [tab]);

  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn text-left">
      {/* Header Banner */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
              <Trophy className="h-4 w-4" /> Clasament Național
            </div>
            <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-black text-slate-100">
              Topul Cuceritorilor CONQUIZ
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Cei mai buni strategi de cultură generală din România.
            </p>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              fetchLeaderboard(tab);
            }}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizează</span>
          </button>
        </div>

        {/* Tab Filters */}
        <div className="mt-6 flex flex-wrap gap-2">
          {[
            { id: 'rating', label: 'Rating Elo', icon: Award },
            { id: 'wins', label: 'Număr Victorii', icon: Trophy },
            { id: 'territories', label: 'Teritorii Cucerite', icon: Flag },
            { id: 'score', label: 'Scor Maxim', icon: Flame },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sound.playClick();
                  setTab(item.id as any);
                }}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                  isActive
                    ? 'border border-amber-500/40 bg-amber-500/20 text-amber-300 shadow-sm'
                    : 'border border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Podium Top 3 */}
      {top3.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          {/* #2 Place */}
          {top3[1] && (
            <div className="order-2 sm:order-1 rounded-2xl border border-slate-700 bg-slate-900/80 p-5 text-center shadow-lg">
              <span className="text-3xl">🥈</span>
              <h4 className="mt-2 text-sm font-bold text-slate-100 truncate">{top3[1].username}</h4>
              <p className="text-[11px] text-slate-400">{top3[1].title || 'Jucător'}</p>
              <div className="mt-3 inline-block rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 font-mono text-xs font-bold text-slate-300">
                {tab === 'rating' ? `${top3[1].rating} Elo` : tab === 'wins' ? `${top3[1].wins} Victorii` : tab === 'territories' ? `${top3[1].territoriesConquered} Teritorii` : `${top3[1].highestScore} pct`}
              </div>
            </div>
          )}

          {/* #1 Place */}
          {top3[0] && (
            <div className="order-1 sm:order-2 rounded-2xl border-2 border-amber-400 bg-gradient-to-b from-amber-500/20 to-slate-900 p-6 text-center ring-4 ring-amber-500/10 shadow-2xl shadow-amber-500/20">
              <span className="text-4xl">🥇</span>
              <h4 className="mt-2 text-base font-black text-amber-300 truncate">{top3[0].username}</h4>
              <p className="text-xs text-amber-400/80 font-semibold">{top3[0].title || 'Jucător'}</p>
              <div className="mt-3 inline-block rounded-xl border border-amber-500/50 bg-slate-950 px-4 py-1.5 font-mono text-sm font-black text-amber-400">
                {tab === 'rating' ? `${top3[0].rating} Elo` : tab === 'wins' ? `${top3[0].wins} Victorii` : tab === 'territories' ? `${top3[0].territoriesConquered} Teritorii` : `${top3[0].highestScore} pct`}
              </div>
            </div>
          )}

          {/* #3 Place */}
          {top3[2] && (
            <div className="order-3 sm:order-3 rounded-2xl border border-slate-700 bg-slate-900/80 p-5 text-center shadow-lg">
              <span className="text-3xl">🥉</span>
              <h4 className="mt-2 text-sm font-bold text-slate-100 truncate">{top3[2].username}</h4>
              <p className="text-[11px] text-slate-400">{top3[2].title || 'Jucător'}</p>
              <div className="mt-3 inline-block rounded-lg border border-slate-700 bg-slate-950 px-3 py-1 font-mono text-xs font-bold text-slate-300">
                {tab === 'rating' ? `${top3[2].rating} Elo` : tab === 'wins' ? `${top3[2].wins} Victorii` : tab === 'territories' ? `${top3[2].territoriesConquered} Teritorii` : `${top3[2].highestScore} pct`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full Leaderboard Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
              <th className="p-3.5 pl-5">Poziție</th>
              <th className="p-3.5">Cuceritor</th>
              <th className="p-3.5 text-center">Meciuri</th>
              <th className="p-3.5 text-center">Victorii</th>
              <th className="p-3.5 text-right pr-5">
                {tab === 'rating' ? 'Rating' : tab === 'wins' ? 'Victorii' : tab === 'territories' ? 'Teritorii' : 'Scor Maxim'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {leaderboard.map((player) => (
              <tr key={player.id} className="hover:bg-slate-800/40 transition">
                <td className="p-3.5 pl-5 font-bold text-slate-400">#{player.rank}</td>
                <td className="p-3.5 font-sans font-bold flex items-center gap-2 text-slate-100">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-xs">
                    {player.avatar === 'av_stefan' ? '👑' : player.avatar === 'av_regina' ? '💎' : '🗡️'}
                  </div>
                  <div>
                    <div className="truncate max-w-[160px]">{player.username}</div>
                    <div className="text-[10px] text-amber-400 font-normal">{player.title || 'Jucător'}</div>
                  </div>
                </td>
                <td className="p-3.5 text-center text-slate-300">{player.matchesPlayed}</td>
                <td className="p-3.5 text-center text-emerald-400">{player.wins}</td>
                <td className="p-3.5 text-right pr-5 font-black text-amber-400">
                  {tab === 'rating' ? `${player.rating} Elo` : tab === 'wins' ? player.wins : tab === 'territories' ? player.territoriesConquered : player.highestScore}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
