import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types/game';
import { api } from '../services/api';
import { socketService } from '../services/socket';
import { sound } from '../services/audio';
import {
  Bot,
  PlusCircle,
  KeyRound,
  Users,
  Trophy,
  Shield,
  Award,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Globe,
  Lock,
  Eye,
  X,
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  onPlayVsAi: (botCount: number, difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert') => void;
  onCreatePrivateRoom: (
    maxPlayers: number,
    selectedCategories?: string[],
    isPrivate?: boolean,
    customRoomName?: string
  ) => void;
  onJoinRoomByCode: (code: string) => void;
  onOpenLeaderboard: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  onPlayVsAi,
  onCreatePrivateRoom,
  onJoinRoomByCode,
  onOpenLeaderboard,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState<any[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // AI Modal State
  const [aiBotCount, setAiBotCount] = useState<number>(3);
  const [aiDifficulty, setAiDifficulty] = useState<'incepator' | 'intermediar' | 'avansat' | 'expert'>('intermediar');

  // Create Room State
  const [customMaxPlayers, setCustomMaxPlayers] = useState<number>(4);
  const [roomIsPrivate, setRoomIsPrivate] = useState<boolean>(false);
  const [customRoomName, setCustomRoomName] = useState<string>('');
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // Lock background page scroll while modal is open and restore scroll position on close
  useEffect(() => {
    const isAnyModalOpen = showCreateModal || showAiModal;
    if (!isAnyModalOpen || typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [showCreateModal, showAiModal]);

  const fetchRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await api.getPublicRooms();
      setPublicRooms(res.rooms || []);
    } catch {
      // ignore
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRooms();
    const socket = socketService.getSocket();
    const onPublicRoomsUpdated = (rooms: any[]) => {
      if (Array.isArray(rooms)) {
        setPublicRooms(rooms);
      } else {
        fetchRooms();
      }
    };
    socket.on('public_rooms_updated', onPublicRoomsUpdated);
    return () => {
      socket.off('public_rooms_updated', onPublicRoomsUpdated);
    };
  }, []);

  const openCreateRoomModal = (defaultPrivate: boolean) => {
    sound.playClick();
    setRoomIsPrivate(defaultPrivate);
    setCustomRoomName(`Cetatea lui ${user.username}`);
    setShowAdvancedSettings(false);
    setShowCreateModal(true);
  };

  const winRate = user.matchesPlayed > 0 ? Math.round((user.wins / user.matchesPlayed) * 100) : 0;

  return (
    <div className="space-y-6 sm:space-y-8 animate-fadeIn">
      {/* Hero Banner with Primary CTA */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/40 p-5 sm:p-10 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Multiplayer Strategic pe Harta României</span>
          </div>

          <h1 className="mt-3 sm:mt-4 font-serif text-2xl sm:text-5xl font-black text-slate-100 leading-tight">
            Cucerește România prin{' '}
            <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">
              Cultură Generală
            </span>
          </h1>

          <p className="mt-2.5 sm:mt-3 text-xs sm:text-base text-slate-300 leading-relaxed">
            Concurează în timp real cu până la <span className="font-bold text-amber-400">10 jucători</span>.
            Alege baza, cucerește zone neutre, participă la departajări și asediază cetățile inamice!
          </p>

          {/* Primary Action Buttons */}
          <div className="mt-5 sm:mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="play-vs-ai-btn"
              onClick={() => {
                sound.playClick();
                setShowAiModal(true);
              }}
              className="flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-6 sm:px-8 py-3.5 sm:py-4 font-serif text-sm sm:text-lg font-black uppercase tracking-wider text-slate-950 shadow-xl shadow-amber-500/30 hover:scale-105 transition active:scale-95 cursor-pointer"
            >
              <Bot className="h-5 w-5 sm:h-6 sm:w-6 text-slate-950 fill-current" />
              <span>Joacă contra AI</span>
            </button>

            <button
              type="button"
              data-testid="open-create-room-btn"
              onClick={() => openCreateRoomModal(false)}
              className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/90 px-5 sm:px-6 py-3.5 sm:py-4 text-xs sm:text-sm font-bold text-slate-200 hover:bg-slate-800 hover:border-amber-500/50 transition cursor-pointer"
            >
              <PlusCircle className="h-5 w-5 text-amber-400" />
              <span>Creează Cameră (Publică / Privată)</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Play Modes Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Create Room Card */}
        <div
          onClick={() => openCreateRoomModal(false)}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left transition hover:border-amber-500/50 hover:bg-slate-900/90 hover:shadow-xl hover:shadow-amber-500/5"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-amber-400 group-hover:scale-110 transition">
              <PlusCircle className="h-5 w-5" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-amber-400 transition group-hover:translate-x-1" />
          </div>
          <h3 className="mt-3.5 text-base font-bold text-slate-100">Creează Cameră Nouă</h3>
          <p className="mt-1 text-xs text-slate-400">
            Creează o cameră publică (vizibilă în listă) sau privată (cu cod) pentru 2–10 jucători.
          </p>
        </div>

        {/* Join by Code / Spectator Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-blue-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Alătură-te cu Cod / Spectator</h3>
              <p className="text-[11px] text-slate-400">
                Cod din 6 caractere (dacă meciul a început, intri ca Spectator <Eye className="inline h-3 w-3 text-sky-400" />)
              </p>
            </div>
          </div>
          <div className="mt-3.5 flex gap-2">
            <input
              type="text"
              data-testid="join-room-code-input"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ex: AB12CD"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-center font-mono font-bold uppercase tracking-widest text-amber-300 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="button"
              data-testid="join-room-code-btn"
              onClick={() => {
                if (joinCode.trim().length >= 4) {
                  sound.playClick();
                  onJoinRoomByCode(joinCode.trim());
                }
              }}
              disabled={joinCode.trim().length < 4}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition cursor-pointer"
            >
              Intră
            </button>
          </div>
        </div>

        {/* Global Leaderboard Card */}
        <div
          onClick={() => {
            sound.playClick();
            onOpenLeaderboard();
          }}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left transition hover:border-amber-500/50 hover:bg-slate-900/90"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-amber-400 group-hover:scale-110 transition">
              <Trophy className="h-5 w-5" />
            </div>
            <span className="font-mono text-xs font-bold text-amber-400">
              Loc #{user.rating > 1400 ? '1' : '3'}
            </span>
          </div>
          <h3 className="mt-3.5 text-base font-bold text-slate-100">Clasament Global</h3>
          <p className="mt-1 text-xs text-slate-400">
            Ratingul tău curent: <span className="font-mono text-amber-400 font-bold">{user.rating} puncte</span> Elo.
          </p>
        </div>
      </div>

      {/* Public Lobbies Live Browser */}
      <div
        data-testid="public-rooms-section"
        className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6 text-left"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Camere Publice Active ({publicRooms.length})
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openCreateRoomModal(false)}
              className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300 hover:bg-emerald-500/25 transition cursor-pointer"
            >
              + Cameră Publică
            </button>
            <button
              type="button"
              onClick={fetchRooms}
              disabled={loadingRooms}
              className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950/70 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
              <span>Actualizează</span>
            </button>
          </div>
        </div>

        {publicRooms.length === 0 ? (
          <div className="py-6 text-center text-xs text-slate-400">
            Nu există camere publice în așteptare chiar acum. Apasă pe{' '}
            <strong className="text-emerald-300">+ Cameră Publică</strong> pentru a deschide o arenă vizibilă tuturor!
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {publicRooms.map((room) => (
              <div
                key={room.roomId}
                data-testid={`public-room-card-${room.roomId}`}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/85 p-3.5 hover:border-emerald-500/40 transition"
              >
                <div className="min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <h4 className="text-xs font-bold text-slate-100 truncate">{room.roomName}</h4>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                    <span>
                      {room.playersCount} / {room.maxPlayers} Jucători
                    </span>
                    <span className="text-amber-400/90">#{room.roomId}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    onJoinRoomByCode(room.roomId);
                  }}
                  className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition shrink-0 cursor-pointer"
                >
                  Intră
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* User Performance Stats Cards */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-5 sm:p-6 text-left">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
            <Award className="h-4 w-4 text-amber-400" /> Statisticile Tale CONQUIZ
          </h3>
          <span className="text-xs text-amber-400/90 font-mono">
            Rating Competitiv: {user.rating} Elo
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <div className="text-[11px] text-slate-400">Meciuri Jucate</div>
            <div className="mt-1 font-mono text-xl font-bold text-slate-100">{user.matchesPlayed}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <div className="text-[11px] text-slate-400">Victorii</div>
            <div className="mt-1 font-mono text-xl font-bold text-emerald-400">{user.wins}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <div className="text-[11px] text-slate-400">Înfrângeri</div>
            <div className="mt-1 font-mono text-xl font-bold text-red-400">{user.losses}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <div className="text-[11px] text-slate-400">Rată Câștig</div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-400">{winRate}%</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <div className="text-[11px] text-slate-400">Teritorii Cucerite</div>
            <div className="mt-1 font-mono text-xl font-bold text-blue-400">{user.territoriesConquered}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <div className="text-[11px] text-slate-400">Răspunsuri Corecte</div>
            <div className="mt-1 font-mono text-xl font-bold text-purple-400">{user.correctAnswersTotal}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-center">
            <div className="text-[11px] text-slate-400">Scor Maxim</div>
            <div className="mt-1 font-mono text-xl font-bold text-amber-300">{user.highestScore}</div>
          </div>
        </div>
      </div>

      {/* Official Game Rules Guide */}
      <div className="rounded-3xl border border-amber-500/30 bg-stone-900/60 p-5 sm:p-6 text-left shadow-xl backdrop-blur-md">
        <h3 className="font-serif text-base font-bold text-amber-300 flex items-center gap-2 border-b border-stone-800 pb-3 mb-4">
          <Shield className="h-5 w-5 text-amber-400" />
          <span>Regulamentul Oficial & Sistemul de Punctaj CONQUIZ</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs leading-relaxed">
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1.5 font-serif">
              <span>🏰</span> Baza Principală & Turnuri
            </div>
            <div className="font-mono text-amber-300 font-black text-lg mb-2">1000 Puncte (3/3)</div>
            <p className="text-stone-300">
              Fiecare cetate are <strong className="text-amber-200">3 turnuri</strong>. În asediu, atacul reușit distruge 1 turn și continuă imediat până când atacatorul greșește, apărătorul se apără sau baza cade.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1.5 font-serif">
              <span>🚩</span> Faza 1: Cucerire
            </div>
            <div className="font-mono text-emerald-300 font-black text-lg mb-2">200 Puncte</div>
            <p className="text-stone-300">
              Jucătorii se extind pe teritoriile neutre adiacente (sau pe orice teritoriu liber rămas dacă nu mai au vecini liberi).
            </p>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-1.5 font-serif">
              <span>⚖️</span> Faza 2: Departajare
            </div>
            <div className="font-mono text-blue-300 font-black text-lg mb-2">300 Puncte</div>
            <p className="text-stone-300">
              Dacă rămân teritorii neutre după cucerire, cel mai rapid răspuns corect câștigă un teritoriu liber și 300 pct.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1.5 font-serif">
              <span>⚔️</span> Faza 3: Război & Regenerare
            </div>
            <div className="font-mono text-red-300 font-black text-lg mb-2">400 Puncte</div>
            <p className="text-stone-300">
              Pe tura ta poți ataca un vecin inamic (cu departajare numerică la egalitate) sau poți <strong className="text-emerald-300">regenera un turn</strong> pierdut!
            </p>
          </div>
        </div>
      </div>

      {/* Modal: Joacă vs AI (Viewport-Centered & Scrollable) */}
      {showAiModal && (
        <div
          data-testid="ai-config-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-4 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowAiModal(false)}
        >
          <div
            className="flex flex-col w-full max-w-md max-h-[calc(100dvh-1.25rem)] sm:max-h-[88dvh] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl text-left overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 sm:px-5 py-3 shrink-0">
              <h3
                id="ai-modal-title"
                className="font-serif text-base sm:text-xl font-bold text-slate-100 flex items-center gap-2"
              >
                <Bot className="h-5 w-5 text-amber-400 shrink-0" /> Configurare Meci vs AI
              </h3>
              <button
                type="button"
                aria-label="Închide dialogul AI"
                onClick={() => setShowAiModal(false)}
                className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3.5 space-y-3.5 text-xs">
              <p className="text-slate-400">
                Alege numărul de adversari virtuali (până la 9 roboți) și nivelul de dificultate.
              </p>

              <div>
                <label className="font-bold text-slate-300">
                  Număr Adversari AI:{' '}
                  <span className="text-amber-400 font-mono font-bold text-sm">{aiBotCount}</span>
                  <span className="text-slate-500 ml-1">({aiBotCount + 1} jucători în total pe hartă)</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={9}
                  value={aiBotCount}
                  onChange={(e) => setAiBotCount(Number(e.target.value))}
                  className="mt-2 w-full accent-amber-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="font-bold text-slate-300 block mb-1.5">Dificultate AI:</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'incepator', label: 'Începător (50%)' },
                    { id: 'intermediar', label: 'Intermediar (70%)' },
                    { id: 'avansat', label: 'Avansat (85%)' },
                    { id: 'expert', label: 'Expert (95%)' },
                  ].map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setAiDifficulty(d.id as any)}
                      className={`rounded-xl border p-2.5 text-center font-semibold transition cursor-pointer ${
                        aiDifficulty === d.id
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/90 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Anulează
              </button>
              <button
                type="button"
                data-testid="confirm-start-ai-btn"
                onClick={() => {
                  sound.playClick();
                  setShowAiModal(false);
                  onPlayVsAi(aiBotCount, aiDifficulty);
                }}
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                Începe Lupta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Creare Cameră Publică sau Privată (Viewport-Centered & Scrollable) */}
      {showCreateModal && (
        <div
          data-testid="create-room-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-room-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-4 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            data-testid="create-room-dialog-card"
            className="flex flex-col w-full max-w-lg max-h-[calc(100dvh-1.25rem)] sm:max-h-[88dvh] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl text-left overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sticky Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-4 sm:px-5 py-3 shrink-0">
              <div className="min-w-0 pr-2">
                <h3
                  id="create-room-modal-title"
                  className="font-serif text-base sm:text-xl font-bold text-slate-100 flex items-center gap-2 truncate"
                >
                  <PlusCircle className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {roomIsPrivate ? 'Cameră Privată Nouă' : 'Cameră Publică Nouă'}
                  </span>
                </h3>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
                  Configurează arena pe harta României (2 până la 10 jucători).
                </p>
              </div>
              <button
                type="button"
                data-testid="close-create-room-modal-btn"
                aria-label="Închide dialogul de creare cameră"
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-white shrink-0 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div
              data-testid="create-room-modal-body"
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3 space-y-3 text-xs"
            >
              {/* Visibility Selector: Public vs Private */}
              <div>
                <label className="font-bold text-slate-300 block mb-1">Tipul Camerei:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="room-type-public-btn"
                    onClick={() => setRoomIsPrivate(false)}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition cursor-pointer ${
                      !roomIsPrivate
                        ? 'border-emerald-500 bg-emerald-500/15 text-emerald-200 shadow-sm'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800/70'
                    }`}
                  >
                    <Globe className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate">Cameră Publică</div>
                      <div className="text-[10px] opacity-80 truncate">Vizibilă în listă</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    data-testid="room-type-private-btn"
                    onClick={() => setRoomIsPrivate(true)}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition cursor-pointer ${
                      roomIsPrivate
                        ? 'border-amber-500 bg-amber-500/15 text-amber-200 shadow-sm'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800/70'
                    }`}
                  >
                    <Lock className="h-4 w-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate">Cameră Privată</div>
                      <div className="text-[10px] opacity-80 truncate">Acces doar cu cod</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Room Name */}
              <div>
                <label className="font-bold text-slate-300 block mb-1">Numele Camerei:</label>
                <input
                  type="text"
                  data-testid="create-room-name-input"
                  maxLength={40}
                  value={customRoomName}
                  onChange={(e) => setCustomRoomName(e.target.value)}
                  placeholder={`Cetatea lui ${user.username}`}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Player Capacity */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-200">Capacitate Jucători:</label>
                  <span className="text-amber-400 font-mono font-black text-xs sm:text-sm">
                    {customMaxPlayers} Jucători
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={customMaxPlayers}
                  onChange={(e) => setCustomMaxPlayers(Number(e.target.value))}
                  className="mt-1.5 w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-0.5">
                  <span>2 jucători (10 zone)</span>
                  <span>4 jucători (20 zone)</span>
                  <span>10 jucători (38 zone)</span>
                </div>
              </div>

              {/* Collapsible Advanced Settings & Structure Details */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/50 overflow-hidden">
                <button
                  type="button"
                  data-testid="create-room-advanced-toggle"
                  aria-expanded={showAdvancedSettings}
                  onClick={() => setShowAdvancedSettings((prev) => !prev)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-bold text-amber-300 hover:bg-slate-800/50 transition cursor-pointer"
                >
                  <span>⚙️ Setări avansate & structura rundelor</span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {showAdvancedSettings ? 'Ascunde ▲' : 'Afișează ▼'}
                  </span>
                </button>
                {showAdvancedSettings && (
                  <div className="border-t border-slate-800 px-3 py-2.5 text-[11px] text-slate-300 space-y-1.5 bg-amber-500/5">
                    <div>
                      <span className="font-bold text-amber-300">⚔️ Structura Rundelor: </span>
                      <span>
                        Bază (1000 pct) &bull; Cucerire (200 pct, ordine fixă pe runde) &bull; Departajare (300 pct) &bull; Război & Asediu (400 pct).
                      </span>
                    </div>
                    <div>
                      <span className="font-bold text-amber-300">📚 Întrebări: </span>
                      <span>
                        Cultură generală cu 4 opțiuni (15s) și întrebări numerice de estimare pentru departajarea duelurilor la egalitate.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky Modal Footer */}
            <div
              data-testid="create-room-modal-footer"
              className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/90 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0"
            >
              <button
                type="button"
                data-testid="cancel-create-room-btn"
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Anulează
              </button>
              <button
                type="button"
                data-testid="confirm-create-room-btn"
                onClick={() => {
                  sound.playClick();
                  setShowCreateModal(false);
                  onCreatePrivateRoom(
                    customMaxPlayers,
                    [],
                    roomIsPrivate,
                    customRoomName.trim() || `Cetatea lui ${user.username}`
                  );
                }}
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                Creează Camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
