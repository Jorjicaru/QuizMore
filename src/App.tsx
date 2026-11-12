import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile, GameState } from './types/game';
import { api } from './services/api';
import { socketService } from './services/socket';
import { sound } from './services/audio';

// Components
import { Navbar } from './components/Navbar';

// Views
import { DashboardView } from './views/DashboardView';
import { LobbyView } from './views/LobbyView';
import { GameView } from './views/GameView';
import { AuthView } from './views/AuthView';
import { LeaderboardView } from './views/LeaderboardView';
import { FriendsView } from './views/FriendsView';
import { ProfileView } from './views/ProfileView';
import { AdminView } from './views/AdminView';
import { SettingsView } from './views/SettingsView';
import { MaintenanceView } from './views/MaintenanceView';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<string>('auth');
  const [activeGame, setActiveGame] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>('');
  const [rejoinableRoom, setRejoinableRoom] = useState<{
    roomId: string;
    roomName: string;
    phase: string;
    botControlled: boolean;
  } | null>(null);
  const [appNotice, setAppNotice] = useState<string | null>(null);

  const checkMaintenanceStatus = useCallback(async () => {
    try {
      const status = await api.getSystemStatus();
      if (status.maintenance) {
        setMaintenanceMode(true);
        setMaintenanceMessage(status.message || 'CONQUIZ este momentan în mentenanță tehnică.');
      } else {
        setMaintenanceMode(false);
      }
    } catch {
      // Ignore network hiccups on status poll
    }
  }, []);

  const checkActiveRoomForUser = useCallback(async (user: UserProfile) => {
    try {
      const res = await api.getMyActiveRoom();
      if (res.activeRoom) {
        setRejoinableRoom({
          roomId: res.activeRoom.roomId,
          roomName: res.activeRoom.roomName,
          phase: res.activeRoom.phase,
          botControlled: res.activeRoom.botControlled,
        });
      } else {
        setRejoinableRoom(null);
      }
    } catch {
      setRejoinableRoom(null);
    }
  }, []);

  // Initialize Auth & Socket listeners. Never sign a visitor into a hard-coded demo account.
  useEffect(() => {
    checkMaintenanceStatus();

    const onMaintenanceEvent = (e: Event) => {
      const custom = e as CustomEvent<{ message?: string }>;
      setMaintenanceMode(true);
      setMaintenanceMessage(custom.detail?.message || 'CONQUIZ este momentan în mentenanță tehnică.');
    };
    window.addEventListener('conquiz:maintenance', onMaintenanceEvent);

    const initAuth = async () => {
      const token = api.getToken();
      if (token) {
        try {
          const res = await api.getMe();
          setCurrentUser(res.user);
          setUnreadNotifs(res.unreadNotificationsCount || 0);
          setActiveTab('dashboard');
          await checkActiveRoomForUser(res.user);
        } catch {
          api.clearToken();
          setCurrentUser(null);
          setActiveTab('auth');
        }
      } else {
        setCurrentUser(null);
        setActiveTab('auth');
      }
    };
    initAuth();

    const socket = socketService.getSocket();
    socket.on('game_state_update', (updatedGame: GameState) => {
      setActiveGame(updatedGame);
      if (updatedGame.phase === 'waiting') setActiveTab('lobby');
      else setActiveTab('game');
    });
    socket.on('chat_message', (msg: any) => setChatMessages((prev) => [...prev, msg]));
    socket.on('maintenance_mode', (payload: { message?: string }) => {
      setMaintenanceMode(true);
      setMaintenanceMessage(payload?.message || 'CONQUIZ este momentan în mentenanță tehnică.');
    });
    socket.on('room_closed_by_admin', (payload: { roomId: string; reason?: string }) => {
      setActiveGame(null);
      setRejoinableRoom(null);
      setActiveTab('dashboard');
      setAppNotice(payload?.reason || 'Camera a fost închisă de administrator.');
    });

    return () => {
      window.removeEventListener('conquiz:maintenance', onMaintenanceEvent);
      socket.off('game_state_update');
      socket.off('chat_message');
      socket.off('maintenance_mode');
      socket.off('room_closed_by_admin');
    };
  }, [checkMaintenanceStatus, checkActiveRoomForUser]);

  const handleLogout = () => {
    sound.playClick();
    api.clearToken();
    if (activeGame) setActiveGame(null);
    setRejoinableRoom(null);
    socketService.disconnect();
    setCurrentUser(null);
    setActiveTab('auth');
  };

  const handleReconnectToRoom = (roomId: string) => {
    if (!currentUser) return;
    sound.playClick();
    const socket = socketService.getSocket();
    socket.emit('reconnect_room', { roomId }, (res: any) => {
      if (res?.success && res.game) {
        setActiveGame(res.game);
        setRejoinableRoom(null);
        if (res.game.phase === 'waiting') {
          setActiveTab('lobby');
        } else {
          setActiveTab('game');
        }
      } else {
        setRejoinableRoom(null);
        setAppNotice(res?.message || 'Meciul nu mai este disponibil pentru reconectare.');
      }
    });
  };

  // --- GAME ACTIONS ---

  const handlePlayVsAi = (botCount: number, difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert') => {
    if (!currentUser) {
      setActiveTab('auth');
      return;
    }
    const socket = socketService.getSocket();
    socket.emit(
      'create_room',
      {
        user: currentUser,
        roomName: `Meci vs ${botCount} Roboți AI`,
        isPrivate: true,
        maxPlayers: botCount + 1,
        initialBotsCount: botCount,
        botDifficulty: difficulty,
      },
      (res: any) => {
        if (res.success && res.game) {
          setActiveGame(res.game);
          setChatMessages([]);
          socket.emit('start_game', {}, () => {
            setActiveTab('game');
          });
        }
      }
    );
  };

  const handleCreatePrivateRoom = (maxPlayers: number, selectedCategories?: string[]) => {
    if (!currentUser) {
      setActiveTab('auth');
      return;
    }
    const socket = socketService.getSocket();
    socket.emit(
      'create_room',
      {
        user: currentUser,
        roomName: `Cetatea lui ${currentUser.username}`,
        isPrivate: true,
        maxPlayers,
        selectedCategories,
      },
      (res: any) => {
        if (res.success && res.game) {
          setActiveGame(res.game);
          setChatMessages([]);
          setActiveTab('lobby');
        }
      }
    );
  };

  const handleJoinRoomByCode = (code: string) => {
    if (!currentUser) {
      setActiveTab('auth');
      return;
    }
    const socket = socketService.getSocket();
    socket.emit('join_room', { roomId: code, user: currentUser }, (res: any) => {
      if (res.success && res.game) {
        setActiveGame(res.game);
        setRejoinableRoom(null);
        setChatMessages([]);
        if (res.game.phase === 'waiting') {
          setActiveTab('lobby');
        } else {
          setActiveTab('game');
        }
      } else {
        setAppNotice(res.message || 'Nu s-a putut intra în cameră.');
      }
    });
  };

  const handleStartGame = () => {
    socketService.getSocket().emit('start_game', {}, (res: any) => {
      if (res.success) {
        setActiveTab('game');
      } else {
        setAppNotice(res.message || 'Jocul nu a putut fi pornit.');
      }
    });
  };

  const handleSetReady = (isReady: boolean) => {
    socketService.getSocket().emit('set_ready', { isReady });
  };

  const handleAddBot = (difficulty: 'incepator' | 'intermediar' | 'avansat' | 'expert') => {
    socketService.getSocket().emit('add_bot', { difficulty });
  };

  const handleRemoveBot = (botId: string) => {
    socketService.getSocket().emit('remove_bot', { botId });
  };

  const handleSendChat = (text: string) => {
    if (currentUser) {
      socketService.getSocket().emit('send_chat', {
        text,
        username: currentUser.username,
        avatar: currentUser.avatar,
      });
    }
  };

  const handleSelectTerritory = (
    territoryId: string,
    cb?: (res: { success: boolean; message?: string; territoryId?: string; pointsAwarded?: number }) => void
  ) => {
    socketService.getSocket().emit('select_territory', { territoryId }, (res: any) => {
      if (cb) cb(res);
    });
  };

  const handleSubmitAnswer = (
    answer: number | string,
    cb?: (res: {
      success: boolean;
      message?: string;
      acceptedAnswer?: number;
      code?: string;
      timedOut?: boolean;
    }) => void,
    questionInstanceId?: string
  ) => {
    socketService
      .getSocket()
      .timeout(3500)
      .emit('submit_answer', { answer, questionInstanceId }, (err: any, res: any) => {
        if (err) {
          if (cb) cb({ success: false, timedOut: true, code: 'ACK_TIMEOUT' });
          return;
        }
        if (cb) cb(res);
      });
  };

  const handleLeaveGame = () => {
    socketService.getSocket().emit('leave_room');
    setActiveGame(null);
    setActiveTab('dashboard');
    if (currentUser) {
      checkActiveRoomForUser(currentUser);
    }
  };

  const handleRematch = () => {
    setActiveGame(null);
    setRejoinableRoom(null);
    setActiveTab('dashboard');
  };

  if (maintenanceMode) {
    return <MaintenanceView message={maintenanceMessage} onRetry={checkMaintenanceStatus} />;
  }

  const isGameActive = Boolean(currentUser && activeTab === 'game' && activeGame);

  return (
    <div
      className={
        isGameActive
          ? 'min-h-dvh lg:h-dvh lg:max-h-dvh w-full max-w-full overflow-x-hidden lg:overflow-hidden bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans'
          : 'min-h-dvh w-full max-w-full overflow-x-hidden bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans'
      }
    >
      {/* Navigation Header */}
      <Navbar
        user={currentUser}
        activeTab={activeTab}
        onSelectTab={(tab) => {
          setActiveTab(tab);
        }}
        onLogout={handleLogout}
        unreadNotificationsCount={unreadNotifs}
      />

      {/* Main Content Area */}
      <main
        className={
          !currentUser
            ? 'flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6 flex items-center justify-center'
            : isGameActive
            ? 'flex-1 min-h-0 w-full max-w-[1600px] mx-auto px-1.5 py-1 sm:px-2.5 sm:py-1.5 lg:px-3 lg:py-2 lg:overflow-hidden flex flex-col'
            : 'flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6'
        }
      >
        {appNotice && !isGameActive && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs font-semibold text-amber-200">
            <span>{appNotice}</span>
            <button onClick={() => setAppNotice(null)} className="text-amber-300 hover:text-white">
              ✕
            </button>
          </div>
        )}

        {currentUser && rejoinableRoom && activeTab === 'dashboard' && (
          <div
            data-testid="reconnect-room-banner"
            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-xs shadow-lg"
          >
            <div>
              <span className="font-bold text-emerald-300 uppercase tracking-wider block">
                {rejoinableRoom.phase === 'finished'
                  ? 'Meci Recent Finalizat'
                  : 'Meci Activ în Desfășurare (Loc Rezervat)'}
              </span>
              <span className="text-slate-200">
                Camera <strong className="font-mono text-amber-300">#{rejoinableRoom.roomId}</strong> ({rejoinableRoom.roomName})
                {rejoinableRoom.botControlled ? ' — Un bot joacă temporar în locul tău până revii.' : ''}
              </span>
            </div>
            <button
              onClick={() => handleReconnectToRoom(rejoinableRoom.roomId)}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 transition"
            >
              {rejoinableRoom.phase === 'finished' ? 'Vezi Rezultatul Final' : 'Reintră în Meci'}
            </button>
          </div>
        )}

        {!currentUser ? (
          <AuthView
            onSuccess={(user) => {
              setCurrentUser(user);
              setActiveTab('dashboard');
              checkActiveRoomForUser(user);
            }}
          />
        ) : (
          <>
            {activeTab === 'auth' && (
              <AuthView
                onSuccess={(user) => {
                  setCurrentUser(user);
                  setActiveTab('dashboard');
                  checkActiveRoomForUser(user);
                }}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardView
                user={currentUser}
                onPlayVsAi={handlePlayVsAi}
                onCreatePrivateRoom={handleCreatePrivateRoom}
                onJoinRoomByCode={handleJoinRoomByCode}
                onOpenLeaderboard={() => setActiveTab('leaderboard')}
              />
            )}

            {activeTab === 'lobby' && activeGame && (
              <LobbyView
                game={activeGame}
                currentUser={currentUser}
                onSetReady={handleSetReady}
                onAddBot={handleAddBot}
                onRemoveBot={handleRemoveBot}
                onStartGame={handleStartGame}
                onLeaveLobby={handleLeaveGame}
                onSendChat={handleSendChat}
                chatMessages={chatMessages}
              />
            )}

            {activeTab === 'game' && activeGame && (
              <GameView
                game={activeGame}
                currentUser={currentUser}
                onSelectTerritory={handleSelectTerritory}
                onSubmitAnswer={handleSubmitAnswer}
                onLeaveGame={handleLeaveGame}
                onRematch={handleRematch}
              />
            )}

            {activeTab === 'leaderboard' && <LeaderboardView />}

            {activeTab === 'friends' && (
              <FriendsView
                currentUser={currentUser}
                onChallengeFriend={() =>
                  setAppNotice(
                    'Invitația directă va fi disponibilă într-o versiune viitoare. Creează o cameră privată și trimite codul prietenului.'
                  )
                }
              />
            )}

            {activeTab === 'profile' && (
              <ProfileView
                currentUser={currentUser}
                onUpdateUser={(updated) => setCurrentUser(updated)}
              />
            )}

            {activeTab === 'admin' && currentUser?.role === 'admin' && <AdminView />}

            {activeTab === 'settings' && <SettingsView />}
          </>
        )}
      </main>

      {/* Footer - hidden during active game to ensure map fits viewport without scrolling */}
      {activeTab !== 'game' && (
        <footer className="border-t border-slate-900 bg-slate-950/80 py-3 text-center text-xs text-slate-500">
          <p>CONQUIZ &copy; 2026 &bull; Joc de cultură generală și strategie pe Harta României &bull; Până la 10 Jucători</p>
        </footer>
      )}
    </div>
  );
}
