import React, { useState, useEffect } from 'react';
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<string>('auth');
  const [activeGame, setActiveGame] = useState<GameState | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Initialize Auth & Socket listeners. Never sign a visitor into a hard-coded demo account.
  useEffect(() => {
    const initAuth = async () => {
      const token = api.getToken();
      if (token) {
        try {
          const res = await api.getMe();
          setCurrentUser(res.user);
          setUnreadNotifs(res.unreadNotificationsCount || 0);
          setActiveTab('dashboard');
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
      else if (updatedGame.phase !== 'finished') setActiveTab('game');
    });
    socket.on('chat_message', (msg: any) => setChatMessages((prev) => [...prev, msg]));
    return () => {
      socket.off('game_state_update');
      socket.off('chat_message');
    };
  }, []);

  const handleLogout = () => {
    sound.playClick();
    api.clearToken();
    if (activeGame) setActiveGame(null);
    socketService.disconnect();
    setCurrentUser(null);
    setActiveTab('auth');
  };

  // --- GAME ACTIONS ---

  // Play vs AI with custom bots (1 to 9 bots -> 2 to 10 players total)
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

  // Create Private Room (supports 2 to 10 players and custom category selection!)
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

  // Join Room by 6-char code
  const handleJoinRoomByCode = (code: string) => {
    if (!currentUser) {
      setActiveTab('auth');
      return;
    }
    const socket = socketService.getSocket();
    socket.emit('join_room', { roomId: code, user: currentUser }, (res: any) => {
      if (res.success && res.game) {
        setActiveGame(res.game);
        setChatMessages([]);
        if (res.game.phase === 'waiting') {
          setActiveTab('lobby');
        } else {
          setActiveTab('game');
        }
      } else {
        alert(res.message || 'Nu s-a putut intra în cameră.');
      }
    });
  };

  const handleStartGame = () => {
    socketService.getSocket().emit('start_game', {}, (res: any) => {
      if (res.success) {
        setActiveTab('game');
      } else {
        alert(res.message);
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

  const handleSelectTerritory = (territoryId: string) => {
    socketService.getSocket().emit('select_territory', { territoryId }, (res: any) => {
      if (!res.success && res.message) {
        // Shown in HUD/alert
      }
    });
  };

  const handleSubmitAnswer = (answer: number | string) => {
    socketService.getSocket().emit('submit_answer', { answer });
  };

  const handleLeaveGame = () => {
    socketService.getSocket().emit('leave_room');
    setActiveGame(null);
    setActiveTab('dashboard');
  };

  const handleRematch = () => {
    setActiveGame(null);
    setActiveTab('dashboard');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500 selection:text-slate-950 font-sans">
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
      <main className={
        !currentUser
          ? "flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-center"
          : activeTab === 'game'
          ? "flex-1 w-full max-w-[1600px] mx-auto p-1 sm:p-2 md:p-3 overflow-hidden flex flex-col min-h-0"
          : "flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6"
      }>
        {!currentUser ? (
          <AuthView
            onSuccess={(user) => {
              setCurrentUser(user);
              setActiveTab('dashboard');
            }}
          />
        ) : (
          <>
            {activeTab === 'auth' && (
              <AuthView
                onSuccess={(user) => {
                  setCurrentUser(user);
                  setActiveTab('dashboard');
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
                onChallengeFriend={() => alert('Invitația directă va fi disponibilă într-o versiune viitoare. Creează o cameră privată și trimite codul prietenului.')}
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
