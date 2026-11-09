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
  Shield,
  Trash2,
  Sparkles,
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

  const me = game.players.find(p => p.id === currentUser.id);
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

  // Generate slots for maxPlayers (2 up to 10)
  const totalSlots = game.maxPlayers;
  const slots: Array<Player | null> = [];
  for (let i = 0; i < totalSlots; i++) {
    slots.push(game.players[i] || null);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fadeIn text-left">
      {/* Top Lobby Header with Room Code */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/90 p-5 sm:p-6 shadow-2xl backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
            <Users className="h-4 w-4" /> Cameră de Așteptare CONQUIZ
          </div>
          <h2 className="mt-1 font-serif text-2xl font-black text-slate-100">
            {game.roomName}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Meci configurat pentru <span className="font-bold text-amber-400">{game.maxPlayers} jucători</span> &bull; reguli standard, fără configurarea rundelor
          </p>
        </div>

        {/* Room Code Pill */}
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-amber-500/40 bg-slate-950 px-4 py-2 text-center">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Cod Cameră</div>
            <div className="font-mono text-xl font-black tracking-widest text-amber-400">
              {game.roomId}
            </div>
          </div>

          <button
            onClick={handleCopyCode}
            title="Copiază Codul Camerei"
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-3 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? 'Copiat!' : 'Copiază'}</span>
          </button>

          <button
            onClick={onLeaveLobby}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-3 text-xs font-bold text-red-400 hover:bg-red-500/20 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Ieși</span>
          </button>
        </div>
      </div>

      {/* Main Grid: Player Slots & Chat Box */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Player Slots Grid (Up to 10 players) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
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
                  onClick={() => {
                    sound.playClick();
                    onAddBot(selectedBotDiff);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/20"
                >
                  <Bot className="h-3.5 w-3.5" /> Adaugă Bot
                </button>
              </div>
            )}
          </div>

          {/* Slots Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {slots.map((player, index) => {
              if (player) {
                const isMe = player.id === currentUser.id;
                return (
                  <div
                    key={player.id}
                    className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-md"
                  >
                    <div
                      className="absolute top-0 left-0 bottom-0 w-1.5"
                      style={{ backgroundColor: player.color }}
                    />

                    <div className="flex items-center justify-between pl-2">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-xl shadow-inner">
                          {player.avatar === 'av_stefan' ? '👑' : player.isAi ? '🤖' : '🗡️'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-slate-100">{player.username}</span>
                            {player.isHost && (
                              <span title="Creatorul Camerei">
                                <Crown className="h-3.5 w-3.5 text-amber-400" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {player.isAi ? `Adversar AI (${player.aiDifficulty})` : isMe ? 'Tu' : 'Războinic'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {player.isAi && isHost && (
                          <button
                            onClick={() => onRemoveBot(player.id)}
                            title="Elimină Bot"
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}

                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
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

              // Empty Slot
              return (
                <div
                  key={`empty_${index}`}
                  className="flex items-center justify-between rounded-2xl border-2 border-dashed border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex items-center gap-3 text-slate-600">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 text-xs font-mono font-bold">
                      #{index + 1}
                    </div>
                    <span className="text-xs font-medium italic">Loc Liber...</span>
                  </div>

                  {isHost && (
                    <button
                      onClick={() => onAddBot(selectedBotDiff)}
                      className="rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      + Bot AI
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Player Ready & Start Game Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 mt-6">
            <div>
              {!isHost && me && (
                <button
                  onClick={() => {
                    sound.playClick();
                    onSetReady(!me.isReady);
                  }}
                  className={`rounded-xl px-6 py-2.5 text-xs font-bold transition ${
                    me.isReady
                      ? 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  }`}
                >
                  {me.isReady ? '✓ Ești Pregătit!' : 'Apasă: Sunt Pregătit!'}
                </button>
              )}
            </div>

            {isHost && (
              <button
                onClick={() => {
                  sound.playClick();
                  onStartGame();
                }}
                disabled={!canStart}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-8 py-3 font-serif text-sm font-black uppercase tracking-wider text-slate-950 shadow-xl shadow-amber-500/20 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 transition cursor-pointer"
              >
                <Play className="h-5 w-5 fill-current" />
                <span>PORNEȘTE JOCUL</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Col: In-Lobby Chat */}
        <div className="flex flex-col h-[480px] rounded-3xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-3 mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            <MessageSquare className="h-4 w-4 text-amber-400" />
            <span>Chat-ul Camerei</span>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
            {chatMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-600 italic">
                Niciun mesaj încă. Trimite primul mesaj!
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-2.5">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                    <span className="font-bold text-amber-400">{msg.username}</span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-200 break-words">{msg.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Chat Form */}
          <form onSubmit={handleChatSubmit} className="mt-3 flex gap-2 pt-2 border-t border-slate-800">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Scrie un mesaj..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-500 p-2 text-slate-950 hover:bg-amber-400 transition"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
