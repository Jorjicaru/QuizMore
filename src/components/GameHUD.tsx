import React, { useEffect, useState } from 'react';
import { GameState } from '../types/game';
import { Swords, Volume2, VolumeX, LogOut, Scroll, Flag } from 'lucide-react';
import { sound } from '../services/audio';
import { RoundTracker } from './RoundTracker';

interface GameHUDProps {
  game: GameState;
  currentUserId?: string;
  onLeaveGame: () => void;
}

export const GameHUD: React.FC<GameHUDProps> = ({ game, currentUserId, onLeaveGame }) => {
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());
  const [showLog, setShowLog] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());

  useEffect(() => {
    if (!game.turnTimerExpiresAt || game.currentQuestion || game.phase === 'waiting' || game.phase === 'finished') return;
    const tick = () => setClockNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 40);
    return () => window.clearInterval(timer);
  }, [game.turnTimerExpiresAt, game.currentQuestion, game.phase]);

  const selectionRemainingMs = game.turnTimerExpiresAt && !game.currentQuestion
    ? Math.max(0, game.turnTimerExpiresAt - clockNow)
    : 0;
  const selectionTimerVisible = selectionRemainingMs > 0 && game.phase !== 'waiting' && game.phase !== 'finished';
  const selectionProgress = game.turnTimeLimit > 0
    ? Math.max(0, Math.min(100, (selectionRemainingMs / (game.turnTimeLimit * 1000)) * 100))
    : 0;
  const selectionActionLabel = game.phase === 'base_selection' ? 'Alege baza'
    : game.phase === 'conquest' ? 'Alege teritoriul de cucerit'
    : game.phase === 'allocation' ? 'Alege teritoriul câștigat'
    : 'Alege ținta atacului';
  const selectionSeconds = Math.ceil(selectionRemainingMs / 1000);

  const activePlayer = game.players[game.activePlayerIndex];
  const isMyTurn = currentUserId && activePlayer?.id === currentUserId;

  const handleToggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="w-full shrink-0 space-y-1 sm:space-y-1.5">
      {/* Top Bar: Controls + Round Tracker in Center */}
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-stone-800 bg-stone-900/90 px-2.5 py-1.5 sm:px-4 sm:py-2 shadow-xl backdrop-blur-xl">
        {/* Left: Turn Status */}
        <div className="flex items-center gap-2">
          {isMyTurn ? (
            <div className="flex items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500/25 px-2.5 py-1 font-serif text-[11px] font-black uppercase tracking-wider text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.5)] animate-pulse">
              <Swords className="h-3.5 w-3.5" /> <span className="hidden xs:inline">RÂNDUL</span> TĂU!
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-stone-800 bg-stone-950 px-2.5 py-1 text-[11px]">
              <span className="text-stone-400 hidden sm:inline">Rândul lui:</span>
              <span className="font-bold flex items-center gap-1" style={{ color: activePlayer?.color }}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: activePlayer?.color }} />
                <span className="truncate max-w-[80px] sm:max-w-[120px]">{activePlayer?.username || 'Jucător'}</span>
              </span>
            </div>
          )}
        </div>

        {/* Center: Authentic Conquiztador Round Tracker */}
        <div className="flex justify-center shrink-0">
          <RoundTracker
            phase={game.phase}
            currentRound={game.round}
            maxRounds={game.maxRounds}
            players={game.players}
            activePlayerIndex={game.activePlayerIndex}
          />
        </div>

        {/* Right: Sound & Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowLog(!showLog)}
            className="flex items-center gap-1 rounded-xl border border-stone-800 bg-stone-800/80 px-2.5 py-1 text-[11px] font-semibold text-stone-300 hover:bg-stone-700 transition"
          >
            <Scroll className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden md:inline">Jurnal ({game.gameLog.length})</span>
          </button>

          <button
            onClick={handleToggleSound}
            aria-label="Comută Sunetul"
            className="rounded-xl border border-stone-800 bg-stone-800/80 p-1.5 text-stone-300 hover:bg-stone-700 transition"
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5 text-red-400" /> : <Volume2 className="h-3.5 w-3.5 text-emerald-400" />}
          </button>

          <button
            onClick={onLeaveGame}
            className="flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-400 hover:bg-red-500/20 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Părăsește</span>
          </button>
        </div>
      </div>

      {selectionTimerVisible && (
        <div className="rounded-xl border border-amber-500/30 bg-stone-950/90 px-3 py-1.5 shadow-lg" role="timer" aria-live="off">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
            <span className="font-bold uppercase tracking-wider text-amber-200 truncate">{selectionActionLabel}</span>
            <span className={`font-mono text-xs font-black tabular-nums shrink-0 ${selectionSeconds <= 3 ? 'text-red-400 animate-pulse' : 'text-amber-300'}`}>
              {selectionSeconds}s
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-800 shadow-inner">
            <div
              className={`h-full rounded-full ${selectionSeconds <= 3 ? 'bg-red-500' : selectionSeconds <= 6 ? 'bg-amber-400' : 'bg-emerald-500'}`}
              style={{ width: `${selectionProgress}%`, transition: 'width 40ms linear' }}
            />
          </div>
        </div>
      )}

      {/* Players Strip (Horizontal ribbon on mobile, grid on desktop - max 10 players) */}
      <div className="flex overflow-x-auto gap-1.5 pb-0.5 no-scrollbar sm:grid sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
        {game.players.map((player, index) => {
          const isActive = index === game.activePlayerIndex && game.phase !== 'finished';
          const isMe = currentUserId === player.id;
          const territoriesCount = Object.values(game.territories).filter(t => t.ownerId === player.id).length;
          const baseTerritory = Object.values(game.territories).find(t => t.ownerId === player.id && t.isBase);

          return (
            <div
              key={player.id}
              className={`relative overflow-hidden rounded-xl border p-1.5 transition-all backdrop-blur-md shrink-0 min-w-[110px] sm:min-w-0 ${
                isActive
                  ? 'border-amber-400 bg-stone-900/98 ring-2 ring-amber-400/50 shadow-lg scale-[1.02]'
                  : isMe
                  ? 'border-stone-700 bg-stone-900/80'
                  : 'border-stone-800/80 bg-stone-950/70 opacity-90'
              }`}
            >
              {/* Color Bar */}
              <div
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ backgroundColor: player.color }}
              />

              <div className="flex items-center justify-between gap-1 mt-1">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-sm shrink-0">
                    {player.isEliminated ? '💀' : player.isAi ? '🤖' : '⚔️'}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-bold text-stone-100">
                      {player.username}
                    </div>
                  </div>
                </div>

                {player.isEliminated ? (
                  <span className="text-[10px] text-red-400 font-bold font-mono">CĂZUT</span>
                ) : baseTerritory ? (
                  <span
                    title={`Cetatea Bază: ${player.castleTowers ?? 3}/3 turnuri intacte`}
                    className="text-[10px] font-mono font-bold text-amber-400 flex items-center gap-0.5"
                  >
                    🏰 {player.castleTowers ?? 3}/3
                  </span>
                ) : null}
              </div>

              {/* Score & Territories */}
              <div className="mt-1.5 flex items-center justify-between border-t border-stone-800/80 pt-1 text-[11px]">
                <div className="font-mono font-black text-amber-300">
                  {player.score} <span className="text-[9px] text-stone-400 font-normal">pct</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {!!player.defensiveBonus && player.defensiveBonus > 0 && (
                    <span className="text-[9px] text-emerald-400 font-mono font-bold" title="Bonus defensiv activ">
                      +{player.defensiveBonus}
                    </span>
                  )}
                  <div className="flex items-center gap-0.5 text-stone-300 font-mono text-[10px]">
                    <Flag className="h-3 w-3 text-emerald-400" />
                    <span>{territoriesCount}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Game Log Drawer */}
      {showLog && (
        <div className="rounded-2xl border border-stone-800 bg-stone-950/95 p-4 shadow-2xl backdrop-blur-xl animate-fadeIn text-left">
          <div className="flex items-center justify-between border-b border-stone-800 pb-2 mb-3">
            <h4 className="flex items-center gap-2 text-xs font-serif font-bold uppercase tracking-wider text-amber-400">
              <Scroll className="h-4 w-4" /> Jurnalul Bătăliilor CONQUIZ
            </h4>
            <button
              onClick={() => setShowLog(false)}
              className="text-xs text-stone-400 hover:text-stone-200"
            >
              Închide
            </button>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 font-mono text-xs">
            {game.gameLog.slice().reverse().map((log) => (
              <div
                key={log.id}
                className={`rounded-lg px-2.5 py-1.5 border ${
                  log.type === 'conquest'
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                    : log.type === 'battle'
                    ? 'border-red-500/20 bg-red-500/5 text-red-300'
                    : log.type === 'elimination'
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-200 font-bold'
                    : 'border-stone-800 bg-stone-900/60 text-stone-300'
                }`}
              >
                <span className="text-[10px] text-stone-500 mr-2">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                {log.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
