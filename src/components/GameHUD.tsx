import React, { useState, useEffect } from 'react';
import { GameState, Player } from '../types/game';
import { buildRoundDisplayItems, canPlayerRegenerateTower } from '../game/rules';
import { sound } from '../services/audio';
import { socketService } from '../services/socket';
import {
  Flag,
  Swords,
  Castle,
  LogOut,
  Volume2,
  VolumeX,
  Bot,
  ScrollText,
  X,
  Skull,
  Shield,
  Users,
  Eye,
  MessageSquare,
  Sparkles,
} from 'lucide-react';

interface GameHUDProps {
  game: GameState;
  currentUserId: string;
  onLeaveGame: () => void;
  onRegenerateTower?: () => void;
  onToggleChat?: () => void;
  chatCount?: number;
}

export const getAvatarSymbol = (avatar?: string): string => {
  if (!avatar) return '🗡️';
  switch (avatar) {
    case 'av_stefan':
      return '👑';
    case 'av_vlad':
      return '🧛';
    case 'av_mihai':
      return '⚔️';
    case 'av_ecaterina':
      return '🛡️';
    case 'av_mircea':
      return '🏰';
    case 'av_decebal':
      return '🐺';
    case 'av_iancu':
      return '🦅';
    case 'av_maria':
      return '💎';
    case 'av_vlaicu':
      return '✈️';
    case 'av_aslan':
      return '🧪';
    case 'av_razes':
    default:
      return avatar.startsWith('av_') ? '🗡️' : avatar;
  }
};

const renderTowerPips = (towers: number) => {
  const safeTowers = Math.max(0, Math.min(3, towers ?? 3));
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-amber-500/35 bg-stone-950/90 px-1.5 py-0.5 text-[10px] font-black text-amber-300 tabular-nums shadow-sm"
      title={`Turnuri de cetate intacte: ${safeTowers}/3`}
    >
      <Castle className="h-3 w-3 text-amber-400 shrink-0" />
      <span className="inline-flex items-end gap-0.5">
        {[0, 1, 2].map((idx) => {
          const alive = idx < safeTowers;
          return (
            <span
              key={idx}
              className={`inline-block w-1.5 rounded-t-[2px] transition-all ${
                idx === 1 ? 'h-3' : 'h-2.5'
              } ${
                alive
                  ? 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.7)]'
                  : 'bg-red-950/90 border border-red-500/40 opacity-55'
              }`}
            />
          );
        })}
      </span>
      <span>{safeTowers}/3</span>
    </span>
  );
};

export const renderPlayerCardItem = (
  player: Player,
  game: GameState,
  currentUserId: string,
  variant: 'sidebar' | 'mobile'
) => {
  const isTurn =
    game.players[game.activePlayerIndex]?.id === player.id &&
    game.phase !== 'finished' &&
    game.phase !== 'war';
  const isMe = player.id === currentUserId;
  const isElim = player.isEliminated;

  const isWarAttacker =
    game.phase === 'war' && Boolean(game.warRound?.attackerIds.includes(player.id));
  const isWarDefender =
    game.phase === 'war' && Boolean(game.warRound?.defenderIds.includes(player.id));
  const isWarBye =
    game.phase === 'war' && Boolean(game.warRound?.byePlayerIds.includes(player.id));

  return (
    <div
      key={player.id}
      data-testid={`player-card-${player.id}`}
      className={`relative overflow-hidden rounded-xl border transition-all duration-200 ${
        variant === 'mobile'
          ? 'shrink-0 w-[156px] sm:w-[172px] snap-start p-1.5'
          : 'px-2.5 py-1.5'
      } ${
        isElim
          ? 'border-stone-800/80 bg-stone-950/50 opacity-50 grayscale'
          : isTurn || isWarAttacker
          ? 'border-amber-400/90 bg-stone-900/95 shadow-[0_0_12px_rgba(245,158,11,0.22)]'
          : isWarDefender
          ? 'border-sky-400/70 bg-stone-900/90'
          : 'border-stone-800/90 bg-stone-950/85 hover:border-stone-700'
      }`}
    >
      {/* Top Color Bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: player.color }}
      />

      <div className="flex items-center justify-between gap-1 pt-0.5">
        <div className="flex items-center gap-1 min-w-0">
          <div className="relative shrink-0">
            <span
              className="flex h-4 w-4 items-center justify-center overflow-hidden rounded-md text-[10px] shadow-sm ring-1 ring-white/25"
              style={{ backgroundColor: player.color }}
            >
              {player.isAi ? (
                <Bot className="h-2.5 w-2.5 text-stone-950 stroke-[2.5]" />
              ) : (
                <span className="text-[9px] leading-none">
                  {getAvatarSymbol(player.avatar)}
                </span>
              )}
            </span>
            {isTurn && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-300 animate-ping" />
            )}
          </div>

          <span
            className={`truncate font-bold text-[11px] leading-tight ${
              isMe ? 'text-amber-300' : 'text-stone-100'
            }`}
            title={player.username}
          >
            {player.username}
          </span>
          {!player.isAi && player.botControlled && (
            <span
              data-testid={`bot-takeover-badge-${player.id}`}
              className="rounded bg-amber-500/20 border border-amber-500/40 px-1 py-0 text-[8px] font-bold text-amber-300 shrink-0"
              title="Jucător deconectat – controlat temporar de bot"
            >
              🤖 Bot
            </span>
          )}
        </div>

        {/* Role / Castle Towers Badge */}
        <div className="flex items-center gap-1 shrink-0">
          {game.phase === 'war' && !isElim && (isWarAttacker || isWarDefender || isWarBye) && (
            <span
              className={`inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[8px] font-black uppercase ${
                isWarAttacker
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : isWarDefender
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                  : 'bg-stone-800 text-stone-400'
              }`}
            >
              {isWarAttacker ? (
                <>
                  <Swords className="h-2 w-2" /> ATAC
                </>
              ) : isWarDefender ? (
                <>
                  <Shield className="h-2 w-2" /> APĂRĂ
                </>
              ) : (
                'BYE'
              )}
            </span>
          )}

          {isElim ? (
            <span className="inline-flex items-center gap-0.5 rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-bold text-red-400">
              <Skull className="h-2.5 w-2.5" /> ELIMINAT
            </span>
          ) : (
            renderTowerPips(player.castleTowers)
          )}
        </div>
      </div>

      {/* Bottom Row: Score + Territory Count */}
      <div className="mt-1 flex items-center justify-between border-t border-stone-800/70 pt-1 text-[10px]">
        <div className="font-mono font-black text-amber-400 tabular-nums leading-none">
          {player.score}{' '}
          <span className="text-[8px] font-normal text-stone-400">pct</span>
        </div>

        <div className="flex items-center gap-1 text-stone-300 font-mono tabular-nums leading-none">
          <Flag className="h-2.5 w-2.5 text-emerald-400" />
          <span>{player.territoriesCount}</span>
        </div>
      </div>
    </div>
  );
};

export const PlayerSidebar: React.FC<{
  game: GameState;
  currentUserId: string;
}> = ({ game, currentUserId }) => {
  const rankedPlayers = [...game.players]
    .map((p, originalIdx) => ({ player: p, originalIdx }))
    .sort((a, b) => b.player.score - a.player.score || a.originalIdx - b.originalIdx);

  const occupiedTerritoriesCount = Object.values(game.territories).filter((t) => t.ownerId !== null).length;
  const totalTerritoriesCount = Object.keys(game.territories).length;
  const activeCount = game.players.filter((p) => !p.isEliminated).length;

  return (
    <aside
      data-testid="desktop-player-sidebar"
      className="hidden xl:flex xl:flex-col w-[264px] xl:w-[284px] shrink-0 h-full min-h-0 rounded-2xl border border-stone-800/90 bg-stone-950/95 p-2 shadow-2xl backdrop-blur-xl"
    >
      {/* Compact Scoreboard Header */}
      <div className="flex items-center justify-between border-b border-stone-800/80 px-1 pb-1.5 mb-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-amber-400" />
          <span className="font-serif text-xs font-bold tracking-wider text-amber-200 uppercase">
            Comandanți ({activeCount}/{game.players.length})
          </span>
        </div>
        <span className="text-[10px] font-mono text-stone-400">
          {occupiedTerritoriesCount}/{totalTerritoriesCount} zone
        </span>
      </div>

      {/* Scoreboard Rows */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-0.5 flex flex-col gap-1 no-scrollbar">
        {rankedPlayers.map(({ player }, rankIdx) => {
          const rank = rankIdx + 1;
          const isTurn =
            game.players[game.activePlayerIndex]?.id === player.id &&
            game.phase !== 'finished' &&
            game.phase !== 'war';
          const isMe = player.id === currentUserId;
          const isElim = player.isEliminated;

          const isWarAttacker =
            game.phase === 'war' && Boolean(game.warRound?.attackerIds.includes(player.id));
          const isWarDefender =
            game.phase === 'war' && Boolean(game.warRound?.defenderIds.includes(player.id));
          const isWarBye =
            game.phase === 'war' && Boolean(game.warRound?.byePlayerIds.includes(player.id));

          return (
            <div
              key={player.id}
              data-testid={`player-row-${player.id}`}
              className={`relative flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg border transition-all text-xs ${
                isElim
                  ? 'border-stone-800/60 bg-stone-950/40 opacity-45 grayscale'
                  : isTurn || isWarAttacker
                  ? 'border-amber-400/80 bg-amber-950/30 shadow-[0_0_8px_rgba(245,158,11,0.18)] ring-1 ring-amber-400/40'
                  : isWarDefender
                  ? 'border-sky-400/70 bg-sky-950/25 ring-1 ring-sky-400/30'
                  : isMe
                  ? 'border-stone-700 bg-stone-900/90'
                  : 'border-stone-800/80 bg-stone-950/75 hover:border-stone-700'
              }`}
            >
              {/* Left: Rank + Color Indicator Badge + Name */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-3.5 text-[10px] font-mono font-bold shrink-0 text-center ${
                    rank === 1
                      ? 'text-amber-300 font-black'
                      : rank === 2
                      ? 'text-stone-300'
                      : rank === 3
                      ? 'text-amber-600'
                      : 'text-stone-500'
                  }`}
                >
                  #{rank}
                </span>

                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] shadow-sm ring-1 ring-white/20"
                  style={{ backgroundColor: player.color }}
                >
                  {player.isAi ? (
                    <Bot className="h-3 w-3 text-stone-950 stroke-[2.5]" />
                  ) : (
                    <span className="text-[10px] leading-none">
                      {getAvatarSymbol(player.avatar)}
                    </span>
                  )}
                </span>

                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className={`truncate font-bold text-[11px] leading-tight ${
                        isMe ? 'text-amber-300' : 'text-stone-100'
                      }`}
                      title={player.username}
                    >
                      {player.username}
                    </span>
                    {isMe && (
                      <span className="rounded bg-amber-500/25 px-1 py-0 text-[8px] font-black text-amber-300 shrink-0">
                        TU
                      </span>
                    )}
                    {!player.isAi && player.botControlled && (
                      <span
                        data-testid={`sidebar-bot-badge-${player.id}`}
                        className="rounded bg-amber-500/20 border border-amber-500/40 px-1 py-0 text-[8px] font-bold text-amber-300 shrink-0"
                        title="Jucător deconectat – controlat temporar de bot"
                      >
                        🤖 Bot temporar
                      </span>
                    )}
                  </div>

                  {/* Status subtitle if active or war */}
                  <div className="flex items-center gap-1 text-[9px] text-stone-400 leading-none mt-0.5">
                    {game.phase === 'war' && !isElim && (
                      <span
                        className={`font-bold ${
                          isWarAttacker
                            ? 'text-amber-400'
                            : isWarDefender
                            ? 'text-sky-400'
                            : 'text-stone-500'
                        }`}
                      >
                        {isWarAttacker
                          ? '⚔️ ATAC'
                          : isWarDefender
                          ? '🛡️ APĂRĂ'
                          : isWarBye
                          ? 'BYE'
                          : ''}
                      </span>
                    )}
                    {isTurn && (
                      <span className="text-amber-300 font-bold flex items-center gap-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                        Mută
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Territories, Towers, Score */}
              <div className="flex items-center gap-1.5 shrink-0 text-right">
                <div
                  className="flex items-center gap-0.5 text-[10px] text-stone-300 font-mono tabular-nums"
                  title={`${player.territoriesCount} teritorii`}
                >
                  <Flag className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                  <span>{player.territoriesCount}</span>
                </div>

                {isElim ? (
                  <span
                    className="text-[9px] font-bold text-red-400 flex items-center gap-0.5"
                    title="Eliminat"
                  >
                    <Skull className="h-2.5 w-2.5" />
                  </span>
                ) : (
                  renderTowerPips(player.castleTowers)
                )}

                <div className="font-mono font-black text-amber-400 tabular-nums text-xs min-w-[36px] text-right">
                  {player.score} <span className="text-[8px] font-normal text-stone-400">pct</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};

export const GameHUD: React.FC<GameHUDProps> = ({
  game,
  currentUserId,
  onLeaveGame,
  onRegenerateTower,
  onToggleChat,
  chatCount = 0,
}) => {
  const activePlayer = game.players[game.activePlayerIndex];
  const mePlayer = game.players.find((p) => p.id === currentUserId);
  const isSpectator = !mePlayer;

  const myWarBattle =
    game.phase === 'war' && game.warRound
      ? game.warRound.battles.find((b) => b.attackerId === currentUserId)
      : undefined;

  const isMyTurn =
    !isSpectator &&
    game.phase !== 'finished' &&
    !game.currentQuestion &&
    (game.phase === 'war' && game.warRound
      ? Boolean(
          game.warRound.status === 'selecting_targets' &&
            myWarBattle &&
            myWarBattle.targetTerritoryId === null &&
            myWarBattle.status !== 'skipped'
        )
      : activePlayer?.id === currentUserId);

  const canRegenerateTowerNow =
    isMyTurn &&
    game.phase === 'war' &&
    canPlayerRegenerateTower(currentUserId, game.territories);

  const [muted, setMuted] = useState(sound.getIsMuted());
  const [timeLeft, setTimeLeft] = useState<number>(15);
  const [showLogDrawer, setShowLogDrawer] = useState(false);

  const timerBarRef = React.useRef<HTMLDivElement>(null);
  const rafIdRef = React.useRef<number | null>(null);
  const lastSecondsRef = React.useRef<number>(-1);
  const lastColorBucketRef = React.useRef<string>('');

  const toggleMute = () => {
    const next = sound.toggleMute();
    setMuted(next);
  };

  useEffect(() => {
    const deadline = game.turnTimerExpiresAt;
    const totalDurationMs = (game.turnTimeLimit || 15) * 1000;
    lastColorBucketRef.current = '';

    if (
      game.phase === 'finished' ||
      game.phase === 'waiting' ||
      game.currentQuestion ||
      !deadline ||
      deadline <= 0
    ) {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const update = () => {
      const now = socketService.getEstimatedServerNow();
      const remainingMs = Math.max(0, deadline - now);
      const ratio = Math.max(0, Math.min(1, remainingMs / totalDurationMs));

      if (timerBarRef.current) {
        timerBarRef.current.style.transform = `scaleX(${ratio})`;
        const remSec = Math.ceil(remainingMs / 1000);
        const nextBucket = remSec <= 4 ? '#ef4444' : remSec <= 8 ? '#f59e0b' : '#10b981';
        if (nextBucket !== lastColorBucketRef.current) {
          lastColorBucketRef.current = nextBucket;
          timerBarRef.current.style.backgroundColor = nextBucket;
        }
      }

      const currentSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      if (currentSeconds !== lastSecondsRef.current) {
        lastSecondsRef.current = currentSeconds;
        setTimeLeft(currentSeconds);
      }

      if (remainingMs > 0) {
        rafIdRef.current = requestAnimationFrame(update);
      } else {
        rafIdRef.current = null;
      }
    };

    update();

    const handleVisibilityChange = () => {
      if (!document.hidden && deadline > socketService.getEstimatedServerNow()) {
        if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
        update();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [game.turnTimerExpiresAt, game.turnTimeLimit, game.phase, game.currentQuestion]);

  const showSelectionTimer =
    game.phase !== 'finished' &&
    game.phase !== 'waiting' &&
    !game.currentQuestion &&
    game.turnTimerExpiresAt > 0;

  const trackerModel = buildRoundDisplayItems(game);

  const renderTurnStatusPill = () => {
    if (isSpectator) {
      return (
        <div
          data-testid="spectator-mode-badge"
          className="flex items-center gap-1.5 rounded-lg border border-sky-400/70 bg-sky-500/20 px-2 sm:px-2.5 py-1 shadow-sm"
        >
          <Eye className="h-3.5 w-3.5 text-sky-300 shrink-0" />
          <span className="font-serif text-[10px] sm:text-xs font-black tracking-wide text-sky-200 whitespace-nowrap">
            MOD SPECTATOR
          </span>
        </div>
      );
    }
    if (game.phase === 'finished') {
      return <span className="text-xs font-bold text-emerald-400">🏆 MECI ÎNCHEIAT</span>;
    }
    if (isMyTurn) {
      return (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-400/70 bg-amber-500/20 px-2 sm:px-2.5 py-1 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
          <Swords className="h-3.5 w-3.5 text-amber-300 shrink-0" />
          <span className="font-serif text-[10px] sm:text-xs font-black tracking-wide text-amber-200 whitespace-nowrap">
            RÂNDUL TĂU PE HARTĂ!
          </span>
        </div>
      );
    }
    if (game.phase === 'war' && game.warRound) {
      const battle = game.warRound.battles[0];
      const atk = battle ? game.players.find((p) => p.id === battle.attackerId) : activePlayer;
      const def =
        battle && battle.defenderId
          ? game.players.find((p) => p.id === battle.defenderId)
          : undefined;
      return (
        <div className="flex items-center gap-1.5 rounded-lg border border-stone-700/80 bg-stone-900/90 px-2 sm:px-2.5 py-1 min-w-0">
          <Swords className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] sm:text-xs font-bold text-stone-200 truncate max-w-[140px] sm:max-w-[240px]">
            {game.warRound.status === 'selecting_targets'
              ? `${atk?.username || 'Atacatorul'} alege ținta...`
              : atk && def
              ? `⚔️ ${atk.username} vs ${def.username}`
              : 'Atac în desfășurare'}
          </span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-stone-800 bg-stone-900/90 px-2 sm:px-2.5 py-1 min-w-0">
        <span
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: activePlayer?.color }}
        />
        <span className="text-[11px] sm:text-xs text-stone-300 truncate max-w-[140px] sm:max-w-[220px]">
          Mută: <strong className="text-white">{activePlayer?.username}</strong>
        </span>
      </div>
    );
  };

  const renderUtilityButtons = () => (
    <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
      {game.spectators && game.spectators.length > 0 && (
        <span
          data-testid="spectator-count-badge"
          className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-950/60 px-2 py-1 text-[10px] font-bold text-sky-300"
          title={`Spectatori în cameră: ${game.spectators.map((s) => s.username).join(', ')}`}
        >
          <Eye className="h-3 w-3 text-sky-400" />
          <span>{game.spectators.length}</span>
        </span>
      )}

      {onToggleChat && (
        <button
          type="button"
          data-testid="game-chat-btn"
          onClick={onToggleChat}
          className="flex min-h-[34px] items-center gap-1 rounded-lg border border-stone-700/80 bg-stone-900/90 px-2 sm:px-2.5 py-1 text-[11px] font-semibold text-stone-200 hover:bg-stone-800 transition cursor-pointer"
          title="Deschide Chat-ul Camerei"
        >
          <MessageSquare className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span className="hidden sm:inline">Chat</span>
          {chatCount > 0 && (
            <span className="font-mono text-[10px] text-amber-300">({chatCount})</span>
          )}
        </button>
      )}

      <button
        type="button"
        onClick={() => setShowLogDrawer(true)}
        className="flex min-h-[34px] items-center gap-1 rounded-lg border border-amber-500/30 bg-stone-900/90 px-2 sm:px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-stone-800 transition cursor-pointer"
        title="Deschide Jurnalul de Război"
      >
        <ScrollText className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="hidden sm:inline">Jurnal</span>
        <span className="font-mono text-[10px] text-amber-300/90">
          ({game.gameLog.length})
        </span>
      </button>

      <button
        type="button"
        onClick={toggleMute}
        className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-stone-700/80 bg-stone-900/90 p-1.5 text-stone-300 hover:bg-stone-800 hover:text-white transition cursor-pointer"
        title={muted ? 'Activează sunetul' : 'Oprește sunetul'}
        aria-label={muted ? 'Activează sunetul' : 'Oprește sunetul'}
      >
        {muted ? (
          <VolumeX className="h-3.5 w-3.5 text-red-400" />
        ) : (
          <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
        )}
      </button>

      <button
        type="button"
        onClick={onLeaveGame}
        className="flex min-h-[34px] items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 sm:px-2.5 py-1 text-[11px] font-semibold text-red-300 hover:bg-red-500/20 transition cursor-pointer"
        title="Părăsește Meciul"
        aria-label="Părăsește Meciul"
      >
        <LogOut className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden sm:inline">Părăsește</span>
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-1 sm:gap-1.5 shrink-0 w-full max-w-full overflow-hidden">
      {/* COMPACT TOP COMMAND BAR (Desktop & Mobile) */}
      <div className="rounded-xl border border-stone-800/90 bg-stone-950/95 px-2 sm:px-2.5 py-1.5 shadow-xl backdrop-blur-xl flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2">
          {/* Left: Turn Status Pill + Regenerate Tower CTA when eligible */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {renderTurnStatusPill()}

            {canRegenerateTowerNow && onRegenerateTower && (
              <button
                type="button"
                data-testid="regenerate-tower-btn"
                onClick={() => {
                  sound.playClick();
                  onRegenerateTower();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/80 bg-gradient-to-r from-emerald-600 to-teal-600 px-2.5 py-1 text-[11px] sm:text-xs font-black text-white shadow-[0_0_14px_rgba(16,185,129,0.45)] hover:from-emerald-500 hover:to-teal-500 active:scale-95 transition cursor-pointer"
                title="Răspunde corect la o întrebare pentru a reface +1 turn la cetatea ta (consumă tura de atac)"
              >
                <Castle className="h-3.5 w-3.5 text-amber-200 shrink-0" />
                <span>Regenerează un turn ({mePlayer?.castleTowers ?? 2}/3)</span>
                <Sparkles className="h-3 w-3 text-amber-200 shrink-0" />
              </button>
            )}
          </div>

          {/* Center: Clean Phase & Round Title */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-serif text-[11px] sm:text-sm font-black tracking-wider text-amber-100 uppercase">
              {trackerModel.phaseLabel}
            </span>
            <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 sm:px-2 py-0.5 font-mono text-[10px] sm:text-xs font-bold text-amber-300">
              {trackerModel.subModeLabel}
            </span>
          </div>

          {/* Right: Action Buttons */}
          {renderUtilityButtons()}
        </div>

        {/* Sleek Integrated Selection Timer Bar */}
        {showSelectionTimer && (
          <div className="flex items-center gap-2 pt-0.5 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/90 truncate">
              {game.phase === 'base_selection'
                ? 'Alege Baza (1000 pct)'
                : game.phase === 'conquest'
                ? 'Cucerește teritoriu liber (200 pct)'
                : game.phase === 'allocation'
                ? 'Revendică teritoriu liber (300 pct)'
                : game.warRound?.status === 'attack_preview'
                ? 'Prezentare atac'
                : canRegenerateTowerNow
                ? 'Alege ținta de atac (400 pct) sau regenerează un turn'
                : 'Alege ținta de atac (400 pct)'}
            </span>
            <div className="h-1.5 flex-1 min-w-[48px] overflow-hidden rounded-full bg-stone-900 border border-stone-800/80">
              <div
                ref={timerBarRef}
                className="h-full w-full origin-left will-change-transform bg-emerald-500"
                style={{ transform: 'scaleX(1)' }}
              />
            </div>
            <span
              className={`font-mono text-[11px] font-black tabular-nums shrink-0 ${
                timeLeft <= 4 ? 'text-red-400 animate-pulse' : 'text-amber-300'
              }`}
            >
              {timeLeft}s
            </span>
          </div>
        )}
      </div>

      {/* MOBILE / TABLET (< 1280px) HORIZONTAL PLAYER STRIP */}
      <div
        data-testid="mobile-player-strip"
        className="flex xl:hidden gap-1.5 overflow-x-auto pb-0.5 snap-x snap-mandatory no-scrollbar"
      >
        {game.players.map((player) =>
          renderPlayerCardItem(player, game, currentUserId, 'mobile')
        )}
      </div>

      {/* SLIDE-OVER GAME LOG DRAWER */}
      {showLogDrawer && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowLogDrawer(false)}
        >
          <div
            className="relative flex h-full w-full max-w-md flex-col border-l border-amber-500/30 bg-stone-950 p-4 sm:p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <ScrollText className="h-5 w-5 text-amber-400" />
                <h3 className="font-serif text-base font-bold text-amber-200 tracking-wide">
                  JURNALUL CRONICILOR DE RĂZBOI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLogDrawer(false)}
                className="rounded-lg border border-stone-700 bg-stone-900 p-1.5 text-stone-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
              {[...game.gameLog].reverse().map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-stone-800/90 bg-stone-900/70 p-2.5 text-xs text-stone-200 leading-relaxed"
                >
                  {entry.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
