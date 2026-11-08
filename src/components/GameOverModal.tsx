import React, { useEffect } from 'react';
import { GameState, Player } from '../types/game';
import confetti from 'canvas-confetti';
import { Trophy, Award, RefreshCw, Home, Flag, CheckCircle2 } from 'lucide-react';
import { sound } from '../services/audio';

interface GameOverModalProps {
  game: GameState;
  currentUserId?: string;
  onRematch: () => void;
  onGoHome: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  game,
  currentUserId,
  onRematch,
  onGoHome,
}) => {
  const sortedPlayers = [...game.players].sort((a, b) => Number(!!a.isEliminated) - Number(!!b.isEliminated) || b.score - a.score);
  const winner = game.winner || sortedPlayers[0];
  const isWinner = currentUserId && winner?.id === currentUserId;

  useEffect(() => {
    sound.playVictory();
    try {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#F59E0B', '#3B82F6', '#10B981', '#EC4899', '#8B5CF6'],
      });
    } catch (e) {
      // Confetti fallback
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-lg animate-fadeIn">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.25)] text-center">
        {/* Victory Header */}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-amber-400 bg-amber-500/20 shadow-2xl shadow-amber-500/30 animate-bounce">
          <Trophy className="h-10 w-10 text-amber-400" />
        </div>

        <h2 className="mt-4 font-serif text-2xl sm:text-3xl font-black tracking-wide text-slate-100">
          {isWinner ? 'VICTORIE GLORIOASĂ!' : 'MECI FINALIZAT'}
        </h2>
        <p className="mt-1 text-sm text-amber-400 font-semibold">
          🏆 {winner?.username} este Stăpânul României cu {winner?.score} puncte!
        </p>

        {/* Podium Highlights (Top 3) */}
        <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-4 items-end max-w-md mx-auto">
          {/* 2nd Place */}
          {sortedPlayers[1] && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3 pt-4 text-center">
              <span className="text-2xl">🥈</span>
              <div className="mt-1 truncate text-xs font-bold text-slate-200">{sortedPlayers[1].username}</div>
              <div className="font-mono text-xs font-bold text-slate-400">{sortedPlayers[1].score} pct</div>
            </div>
          )}

          {/* 1st Place */}
          {sortedPlayers[0] && (
            <div className="rounded-2xl border-2 border-amber-400 bg-amber-500/20 p-4 pt-6 text-center ring-4 ring-amber-500/20 shadow-xl shadow-amber-500/20">
              <span className="text-3xl">🥇</span>
              <div className="mt-1 truncate text-sm font-black text-amber-300">{sortedPlayers[0].username}</div>
              <div className="font-mono text-sm font-black text-amber-400">{sortedPlayers[0].score} pct</div>
            </div>
          )}

          {/* 3rd Place */}
          {sortedPlayers[2] && (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-3 pt-4 text-center">
              <span className="text-2xl">🥉</span>
              <div className="mt-1 truncate text-xs font-bold text-slate-200">{sortedPlayers[2].username}</div>
              <div className="font-mono text-xs font-bold text-slate-400">{sortedPlayers[2].score} pct</div>
            </div>
          )}
        </div>

        {/* Full Rankings Table */}
        <div className="mt-6 max-h-48 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/70 p-2">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="p-2">#</th>
                <th className="p-2">Jucător</th>
                <th className="p-2 text-center">Teritorii</th>
                <th className="p-2 text-center">Răspunsuri</th>
                <th className="p-2 text-right">Scor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {sortedPlayers.map((player, idx) => (
                <tr key={player.id} className={player.id === currentUserId ? 'bg-amber-500/10' : ''}>
                  <td className="p-2 font-bold text-slate-400">{idx + 1}</td>
                  <td className="p-2 font-sans font-bold flex items-center gap-1.5" style={{ color: player.color }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: player.color }} />
                    <span className="truncate max-w-[120px]">{player.username}</span>
                    {player.id === currentUserId && <span className="text-[10px] text-amber-400 font-normal">(Tu)</span>}
                  </td>
                  <td className="p-2 text-center text-slate-300">
                    {Object.values(game.territories).filter(t => t.ownerId === player.id).length}
                  </td>
                  <td className="p-2 text-center text-slate-300">
                    <span className="text-emerald-400">{player.correctAnswers}</span> /{' '}
                    <span className="text-red-400">{player.wrongAnswers}</span>
                  </td>
                  <td className="p-2 text-right font-black text-amber-400">{player.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onRematch}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-6 py-2.5 font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 transition active:scale-95"
          >
            <RefreshCw className="h-4 w-4" /> Joacă din Nou
          </button>

          <button
            onClick={onGoHome}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-6 py-2.5 font-bold text-slate-200 hover:bg-slate-700 transition active:scale-95"
          >
            <Home className="h-4 w-4" /> Înapoi la Meniu
          </button>
        </div>
      </div>
    </div>
  );
};
