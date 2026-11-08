import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types/game';
import { api } from '../services/api';
import { sound } from '../services/audio';
import {
  Play,
  Bot,
  PlusCircle,
  KeyRound,
  Users,
  Trophy,
  Swords,
  Shield,
  Flag,
  Award,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile;
  onPlayVsAi: (botCount: number, difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert') => void;
  onCreatePrivateRoom: (maxPlayers: number, selectedCategories?: string[]) => void;
  onJoinRoomByCode: (code: string) => void;
  onOpenLeaderboard: () => void;
}

const ALL_CATEGORIES: { id: string; name: string; icon: string }[] = [
  { id: 'istorie', name: 'Istorie', icon: '🏛️' },
  { id: 'geografie', name: 'Geografie', icon: '🌍' },
  { id: 'biologie', name: 'Biologie', icon: '🧬' },
  { id: 'fizica', name: 'Fizică', icon: '⚡' },
  { id: 'chimie', name: 'Chimie', icon: '🧪' },
  { id: 'matematica', name: 'Matematică', icon: '📐' },
  { id: 'literatura', name: 'Literatură', icon: '📜' },
  { id: 'arta', name: 'Artă & Arhitectură', icon: '🎨' },
  { id: 'sport', name: 'Sport', icon: '⚽' },
  { id: 'muzica', name: 'Muzică', icon: '🎵' },
  { id: 'cinematografie', name: 'Film & Cinema', icon: '🎬' },
  { id: 'cultura_generala', name: 'Cultură Generală', icon: '💡' },
  { id: 'tehnologie', name: 'Tehnologie', icon: '💻' },
  { id: 'informatica', name: 'Informatică', icon: '🖥️' },
];

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
  const [aiBotCount, setAiBotCount] = useState<number>(3); // 4 players total (1 human + 3 bots)
  const [aiDifficulty, setAiDifficulty] = useState<'incepator' | 'intermediar' | 'avansat' | 'expert'>('intermediar');

  // Create Room State: maxPlayers + Trivia Categories (rounds are fixed by default per phase structure)
  const [customMaxPlayers, setCustomMaxPlayers] = useState<number>(4);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    ALL_CATEGORIES.map(c => c.id)
  );

  const toggleCategory = (catId: string) => {
    setSelectedCategories(prev => {
      if (prev.includes(catId)) {
        if (prev.length <= 1) return prev; // Keep at least 1 category
        return prev.filter(c => c !== catId);
      } else {
        return [...prev, catId];
      }
    });
  };

  const selectAllCategories = () => {
    setSelectedCategories(ALL_CATEGORIES.map(c => c.id));
  };

  const clearCategories = () => {
    // Keep at least default general
    setSelectedCategories(['istorie', 'geografie', 'cultura_generala']);
  };

  const fetchRooms = async () => {
    try {
      setLoadingRooms(true);
      const res = await api.getPublicRooms();
      setPublicRooms(res.rooms || []);
    } catch (e) {
      // ignore
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const winRate = user.matchesPlayed > 0 ? Math.round((user.wins / user.matchesPlayed) * 100) : 0;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Hero Banner with Primary CTA: Joacă vs AI */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-br from-slate-900 via-slate-950 to-amber-950/40 p-6 sm:p-10 shadow-2xl backdrop-blur-xl">
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Multiplayer Strategic pe Harta României</span>
          </div>

          <h1 className="mt-4 font-serif text-3xl sm:text-5xl font-black text-slate-100 leading-tight">
            Cucerește România prin <span className="bg-gradient-to-r from-amber-400 to-amber-200 bg-clip-text text-transparent">Cultură Generală</span>
          </h1>

          <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
            Concurează în timp real cu până la <span className="font-bold text-amber-400">10 jucători</span>.
            Alege baza, cucerește zone neutre, participă la departajări și asediază cetățile inamice!
          </p>

          {/* Primary Action Button: Joacă vs AI */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              onClick={() => {
                sound.playClick();
                setShowAiModal(true);
              }}
              className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-8 py-4 font-serif text-base sm:text-lg font-black uppercase tracking-wider text-slate-950 shadow-xl shadow-amber-500/30 hover:scale-105 transition active:scale-95 cursor-pointer"
            >
              <Bot className="h-6 w-6 text-slate-950 fill-current" />
              <span>Joacă contra AI</span>
            </button>

            <button
              onClick={() => {
                sound.playClick();
                setShowCreateModal(true);
              }}
              className="flex items-center gap-2.5 rounded-2xl border border-slate-700 bg-slate-900/90 px-6 py-4 font-bold text-slate-200 hover:bg-slate-800 hover:border-slate-600 transition cursor-pointer"
            >
              <PlusCircle className="h-5 w-5 text-amber-400" />
              <span>Creează Cameră Privată</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Play Modes Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Create Private Room Card */}
        <div
          onClick={() => {
            sound.playClick();
            setShowCreateModal(true);
          }}
          className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left transition hover:border-amber-500/50 hover:bg-slate-900/90 hover:shadow-xl hover:shadow-amber-500/5"
        >
          <div className="flex items-center justify-between">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-amber-400 group-hover:scale-110 transition">
              <PlusCircle className="h-6 w-6" />
            </div>
            <ArrowRight className="h-5 w-5 text-slate-500 group-hover:text-amber-400 transition group-hover:translate-x-1" />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-100">Creează Cameră Privată</h3>
          <p className="mt-1 text-xs text-slate-400">
            Configurează o arenă personalizată pentru 2 până la 10 prieteni cu cod de invitație.
          </p>
        </div>

        {/* Join by Code Card */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-blue-400">
              <KeyRound className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100">Alătură-te cu Cod</h3>
              <p className="text-xs text-slate-400">Introdu codul camerei din 6 caractere</p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ex: AB12CD"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-center font-mono font-bold uppercase tracking-widest text-amber-300 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
            />
            <button
              onClick={() => {
                if (joinCode.length >= 4) {
                  sound.playClick();
                  onJoinRoomByCode(joinCode);
                }
              }}
              disabled={joinCode.length < 4}
              className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 transition"
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 text-amber-400 group-hover:scale-110 transition">
              <Trophy className="h-6 w-6" />
            </div>
            <span className="font-mono text-xs font-bold text-amber-400">Loc #{user.rating > 1400 ? '1' : '3'}</span>
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-100">Clasament Global</h3>
          <p className="mt-1 text-xs text-slate-400">
            Ratingul tău curent: <span className="font-mono text-amber-400 font-bold">{user.rating} puncte</span> Elo.
          </p>
        </div>
      </div>

      {/* User Performance Stats Cards */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 text-left">
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

      {/* Official Game Rules Guide (Faithful Conquiztador 2 Mechanics) */}
      <div className="rounded-3xl border border-amber-500/30 bg-stone-900/60 p-6 text-left shadow-xl backdrop-blur-md">
        <h3 className="font-serif text-base font-bold text-amber-300 flex items-center gap-2 border-b border-stone-800 pb-3 mb-4">
          <Shield className="h-5 w-5 text-amber-400" />
          <span>Regulamentul Oficial & Sistemul de Punctaj CONQUIZ</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs leading-relaxed">
          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-1.5 font-serif">
              <span>🏰</span> Baza Principală
            </div>
            <div className="font-mono text-amber-300 font-black text-lg mb-2">1000 Puncte</div>
            <p className="text-stone-300">
              Fiecare jucător își alege o bază. <strong className="text-amber-200">Regula zonei tampon:</strong> este strict interzis să alegi o bază vecină cu baza altui jucător (trebuie să existe cel puțin un teritoriu tampon).
            </p>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1.5 font-serif">
              <span>🚩</span> Faza 1: Cucerire
            </div>
            <div className="font-mono text-emerald-300 font-black text-lg mb-2">200 Puncte</div>
            <p className="text-stone-300">
              Jucătorii se extind pe teritoriile neutre adiacente. Nu există atacuri între jucători în această fază. Răspunsul corect alocă teritoriul și 200 pct.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-blue-400 font-bold text-sm mb-1.5 font-serif">
              <span>⚖️</span> Faza 2: Departajare
            </div>
            <div className="font-mono text-blue-300 font-black text-lg mb-2">300 Puncte</div>
            <p className="text-stone-300">
              Dacă rămân teritorii neutre după cucerire, se intră în departajare. Toți jucătorii răspund la întrebare de estimare. Cel mai apropiat câștigă teritoriul și 300 pct.
            </p>
          </div>

          <div className="rounded-2xl border border-stone-800 bg-stone-950/70 p-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-1.5 font-serif">
              <span>⚔️</span> Faza 3: Război
            </div>
            <div className="font-mono text-red-300 font-black text-lg mb-2">400 Puncte</div>
            <p className="text-stone-300">
              Duel între vecini! Câștigătorul primește 400 pct. Atacul pe baza inamică este permis nelimitat pentru vecini, sau o singură încercare pe meci la distanță.
            </p>
          </div>
        </div>
      </div>

      {/* Public Lobbies Live Browser */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 text-left">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Camere Publice Active
            </h3>
          </div>
          <button
            onClick={fetchRooms}
            disabled={loadingRooms}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingRooms ? 'animate-spin' : ''}`} />
            <span>Actualizează</span>
          </button>
        </div>

        {publicRooms.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            Nu există camere publice în așteptare chiar acum. Creează o cameră publică sau privată.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {publicRooms.map((room) => (
              <div
                key={room.roomId}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/80 p-3.5"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-200 truncate max-w-[150px]">{room.roomName}</h4>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    {room.playersCount} / {room.maxPlayers} Jucători
                  </div>
                </div>
                <button
                  onClick={() => {
                    sound.playClick();
                    onJoinRoomByCode(room.roomId);
                  }}
                  className="rounded-lg bg-emerald-500/20 border border-emerald-500/40 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
                >
                  Intră
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Joacă vs AI */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-left">
            <h3 className="font-serif text-xl font-bold text-slate-100 flex items-center gap-2">
              <Bot className="h-5 w-5 text-amber-400" /> Configurare Meci vs AI
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Alege numărul de adversari virtuali (până la 9 roboți) și nivelul de dificultate.
            </p>

            <div className="mt-5 space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-300">
                  Număr Adversari AI: <span className="text-amber-400 font-mono font-bold text-sm">{aiBotCount}</span>
                  <span className="text-slate-500 ml-1">({aiBotCount + 1} jucători în total pe hartă)</span>
                </label>
                <input
                  type="range"
                  min={1}
                  max={9}
                  value={aiBotCount}
                  onChange={(e) => setAiBotCount(Number(e.target.value))}
                  className="mt-2 w-full accent-amber-500"
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
                      className={`rounded-xl border p-2.5 text-center font-semibold transition ${
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

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowAiModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
              >
                Anulează
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setShowAiModal(false);
                  onPlayVsAi(aiBotCount, aiDifficulty);
                }}
                className="rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20"
              >
                Începe Lupta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Creare Cameră Privată */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl text-left max-h-[90vh] overflow-y-auto">
            <h3 className="font-serif text-xl font-bold text-slate-100 flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-amber-400" /> Cameră Privată Nouă
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Configurează arena pentru prieteni pe harta României (până la 10 jucători).
            </p>

            <div className="mt-5 space-y-4 text-xs">
              {/* Player Capacity */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-200">
                    Capacitate Jucători:
                  </label>
                  <span className="text-amber-400 font-mono font-black text-sm">
                    {customMaxPlayers} Jucători
                  </span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={10}
                  value={customMaxPlayers}
                  onChange={(e) => setCustomMaxPlayers(Number(e.target.value))}
                  className="mt-2.5 w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                  <span>2 jucători (15 zone)</span>
                  <span>4 jucători (24 zone)</span>
                  <span>10 jucători (38 zone)</span>
                </div>
              </div>

              {/* Fixed Structure Notice (Requested: "ala ar trebui sa fie default peste ORICARE meci existent") */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-slate-300">
                <span className="font-bold text-amber-300 block mb-1">⚔️ Structura Rundelor (Fixă):</span>
                <span>Faza 1: Bază (1000 pct) &bull; Faza 2: Cucerire (4 runde, 200 pct) &bull; Faza 3: Departajare (300 pct) &bull; Faza 4: Război (5 runde, 400 pct).</span>
              </div>

              {/* Category / Domain Selector (Requested: "tot aici la camere private lasam sa selectez domeniile din care sa fie intrebarile") */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-slate-200">
                    Domenii Întrebări ({selectedCategories.length}/{ALL_CATEGORIES.length}):
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllCategories}
                      className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold underline cursor-pointer"
                    >
                      Selectează Tot
                    </button>
                    <span className="text-slate-600">&bull;</span>
                    <button
                      type="button"
                      onClick={clearCategories}
                      className="text-[10px] text-slate-400 hover:text-slate-200 font-semibold underline cursor-pointer"
                    >
                      Esențiale
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ALL_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        className={`flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs transition cursor-pointer ${
                          isSelected
                            ? 'border-amber-500 bg-amber-500/15 text-amber-200 font-bold shadow-sm'
                            : 'border-slate-800 bg-slate-950/80 text-slate-400 hover:bg-slate-800 hover:text-slate-300'
                        }`}
                      >
                        <span className="text-base">{cat.icon}</span>
                        <span className="truncate">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Anulează
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  setShowCreateModal(false);
                  onCreatePrivateRoom(customMaxPlayers, selectedCategories);
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
