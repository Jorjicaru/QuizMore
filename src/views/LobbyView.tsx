import React, { useState } from 'react';
import { GameState, Player, UserProfile } from '../types/game';
import { sound } from '../services/audio';
import {
  Crown,
  Users,
  Copy,
  Check,
  Bot,
  Play,
  LogOut,
  Send,
  MessageSquare,
  Trash2,
  Globe,
  Lock,
  Eye,
} from 'lucide-react';

interface LobbyViewProps {
  game: GameState;
  currentUser: UserProfile;
  onSetReady: (isReady: boolean) => void;
  onAddBot: (difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert') => void;
  onRemoveBot: (botId: string) => void;
  onStartGame: () => void;
  onLeaveLobby: () => void;
  onSendChat: (text: string) => void;
  chatMessages: Array<{ id: string; username: string; text: string; timestamp: number }>;
}

export const LobbyView: React.FC<LobbyViewProps> = ({
  game,
  currentUser,
  onSetReady,
  onAddBot,
  onRemoveBot,
  onStartGame,
  onLeaveLobby,
  onSendChat,
  chatMessages,
}) => {
  const [copied, setCopied] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [selectedBotDiff, setSelectedBotDiff] = useState<'incepator' | 'intermediar' | 'avansat' | 'expert'>('intermediar');

  const me = game.players.find((p) => p.id === currentUser.id);
  const isHost = me?.isHost || false;
  const canStart = isHost && game.players.length >= 2;

  const handleCopyCode = () => {
    sound.playClick();
    navigator.clipboard.writeText(game.roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const totalSlots = game.maxPlayers;
  const slots: Array<Player | null> = [];
  for (let i = 0; i < totalSlots; i++) {
    slots.push(game.players[i] || null);
  }

  return (
    <div className="space-y-4 sm:space-y-5 max-w-5xl mx-auto animate-fadeIn text-left">
      {/* Compact Top Lobby Header with Room Code & Ready/Start Bar */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 shadow-2xl backdrop-blur-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-400">
              <Users className="h-3.5 w-3.5" />
              <span>Cameră de Așteptare CONQUIZ</span>
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
                  game.isPrivate
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                    : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                {game.isPrivate ? (
                  <>
                    <Lock className="h-2.5 w-2.5" /> Privată
                  </>
                ) : (
                  <>
                    <Globe className="h-2.5 w-2.5" /> Publică
                  </>
                )}
              </span>
            </div>
            <h2 className="mt-1 font-serif text-xl sm:text-2xl font-black text-slate-100 truncate">
              {game.roomName}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
              Meci configurat pentru <span className="font-bold text-amber-400">{game.maxPlayers} jucători</span> &bull; cod invitație / spectator
            </p>
          </div>

          {/* Room Code & Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-amber-500/40 bg-slate-950 px-3 py-1.5 text-center">
              <div className="text-[9px] uppercase font-bold tracking-wider text-slate-400">Cod Cameră</div>
              <div
                data-testid="lobby-room-code"
                className="font-mono text-base sm:text-lg font-black tracking-widest text-amber-400"
              >
                {game.roomId}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyCode}
              title="Copiază Codul Camerei"
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              <span>{copied ? 'Copiat!' : 'Copiază'}</span>
            </button>

            <button
              type="button"
              onClick={onLeaveLobby}
              className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/20 transition cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Ieși</span>
            </button>
          </div>
        </div>

        {/* Always-Visible Primary Ready / Start Bar right inside the header card */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-800/90 pt-3">
          <div className="text-xs text-slate-300">
            Jucători conectați:{' '}
            <strong className="font-mono text-amber-400">
              {game.players.length} / {game.maxPlayers}
            </strong>
            {game.spectators && game.spectators.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-sky-300">
                <Eye className="h-3.5 w-3.5" /> {game.spectators.length} spectatori
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isHost && me && (
              <button
                type="button"
                data-testid="lobby-ready-btn"
                onClick={() => {
                  sound.playClick();
                  onSetReady(!me.isReady);
                }}
                className={`rounded-xl px-5 py-2.5 text-xs font-bold transition cursor-pointer ${
                  me.isReady
                    ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20'
                }`}
              >
                {me.isReady ? '✓ Ești Pregătit!' : 'Apasă: Sunt Pregătit!'}
              </button>
            )}

            {isHost && (
              <button
                type="button"
                data-testid="lobby-start-game-btn"
                onClick={() => {
                  sound.playClick();
                  onStartGame();
                }}
                disabled={!canStart}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-6 py-2.5 font-serif text-xs sm:text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/20 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 transition cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>PORNEȘTE JOCUL</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Player Slots & Compact Chat Box */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Left 2 Cols: Player Slots Grid */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Jucători În Arenă ({game.players.length} / {game.maxPlayers})
            </h3>

            {isHost && game.players.length < game.maxPlayers && (
              <div className="flex items-center gap-2">
                <select
                  value={selectedBotDiff}
                  onChange={(e) => setSelectedBotDiff(e.target.value as any)}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-slate-300"
                >
                  <option value="incepator">Bot Începător</option>
                  <option value="intermediar">Bot Intermediar</option>
                  <option value="avansat">Bot Avansat</option>
                  <option value="expert">Bot Expert</option>
                </select>

                <button
                  type="button"
                  data-testid="lobby-add-bot-btn"
                  onClick={() => {
                    sound.playClick();
                    onAddBot(selectedBotDiff);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20 cursor-pointer"
                >
                  <Bot className="h-3.5 w-3.5" /> Adaugă Bot
                </button>
              </div>
            )}
          </div>

          {/* Compact Slots Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {slots.map((player, index) => {
              if (player) {
                const isMe = player.id === currentUser.id;
                return (
                  <div
                    key={player.id}
                    className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/80 p-3 shadow-md backdrop-blur-md"
                  >
                    <div
                      className="absolute top-0 left-0 bottom-0 w-1.5"
                      style={{ backgroundColor: player.color }}
                    />

                    <div className="flex items-center justify-between pl-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-950 text-base shadow-inner">
                          {player.avatar === 'av_stefan' ? '👑' : player.isAi ? '🤖' : '🗡️'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-xs sm:text-sm text-slate-100 truncate">
                              {player.username}
                            </span>
                            {player.isHost && (
                              <span title="Creatorul Camerei">
                                <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {player.isAi
                              ? `Adversar AI (${player.aiDifficulty})`
                              : isMe
                              ? 'Tu'
                              : 'Războinic'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {player.isAi && isHost && (
                          <button
                            type="button"
                            onClick={() => onRemoveBot(player.id)}
                            title="Elimină Bot"
                            className="p-1 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            player.isReady
                              ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                              : 'border border-amber-500/30 bg-amber-500/10 text-amber-400'
                          }`}
                        >
                          {player.isReady ? 'Gata' : 'Așteaptă'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={`empty_${index}`}
                  className="flex items-center justify-between rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-3"
                >
                  <div className="flex items-center gap-2.5 text-slate-600">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/50 text-xs font-mono font-bold">
                      #{index + 1}
                    </div>
                    <span className="text-xs font-medium italic">Loc Liber...</span>
                  </div>

                  {isHost && (
                    <button
                      type="button"
                      onClick={() => onAddBot(selectedBotDiff)}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      + Bot AI
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Col: Responsive Compact In-Lobby Chat (220px on mobile, 360px on desktop) */}
        <div
          data-testid="lobby-chat-box"
          className="flex flex-col h-[220px] sm:h-[300px] lg:h-[380px] rounded-2xl sm:rounded-3xl border border-slate-800 bg-slate-900/60 p-3.5 sm:p-4 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2.5 mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-400 shrink-0">
            <MessageSquare className="h-4 w-4 text-amber-400" />
            <span>Chat-ul Camerei</span>
          </div>

          {/* Message List */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1 text-xs">
            {chatMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 italic text-center px-2">
                Niciun mesaj încă. Trimite primul mesaj!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                    <span className="font-bold text-amber-400">{msg.username}</span>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <p className="text-slate-200 break-words">{msg.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleChatSubmit} className="mt-2.5 flex gap-2 pt-2 border-t border-slate-800 shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Scrie un mesaj..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-500 p-2 text-slate-950 hover:bg-amber-400 transition cursor-pointer"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
