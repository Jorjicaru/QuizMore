import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types/game';
import {
  Crown,
  Trophy,
  Users,
  Settings,
  ShieldAlert,
  LogOut,
  Volume2,
  VolumeX,
  Menu,
  X,
  Download,
} from 'lucide-react';
import { sound } from '../services/audio';

interface NavbarProps {
  user: UserProfile | null;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onLogout: () => void;
  unreadNotificationsCount?: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  activeTab,
  onSelectTab,
  onLogout,
}) => {
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallPwa = async () => {
    if (!deferredInstallPrompt) return;
    sound.playClick();
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredInstallPrompt(null);
    }
  };

  const handleToggleSound = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const navItems = [
    { id: 'dashboard', label: 'Panou Joc', icon: Crown },
    { id: 'leaderboard', label: 'Clasament', icon: Trophy },
    { id: 'friends', label: 'Prieteni', icon: Users },
    { id: 'settings', label: 'Setări', icon: Settings },
  ];

  if (user?.role === 'admin') {
    navItems.push({ id: 'admin', label: 'Admin', icon: ShieldAlert });
  }

  return (
    <header className="sticky top-0 z-40 w-full shrink-0 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-2.5 py-2 sm:px-6 sm:py-2.5">
        {/* Logo */}
        <div
          onClick={() => {
            if (user) {
              sound.playClick();
              onSelectTab('dashboard');
            }
          }}
          className={`flex min-w-0 shrink-0 items-center gap-2 transition ${
            user ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
          }`}
        >
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 shadow-lg shadow-amber-500/20">
            <Crown className="h-4 w-4 sm:h-5 sm:w-5 text-slate-950" />
          </div>
          <div className="min-w-0">
            <span className="block font-serif text-sm sm:text-base font-black tracking-wider text-slate-100 leading-tight whitespace-nowrap">
              CON<span className="text-amber-400">QUIZ</span>
            </span>
            <span className="block text-[8px] sm:text-[10px] font-mono tracking-wider sm:tracking-widest text-slate-400 whitespace-nowrap leading-tight">
              ROMÂNIA MULTIPLAYER
            </span>
          </div>
        </div>

        {/* Desktop Nav Items - ONLY when authenticated */}
        {user && (
          <nav className="hidden lg:flex items-center gap-1 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-1 shadow-inner">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    sound.playClick();
                    onSelectTab(item.id);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                    isActive
                      ? 'border border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-amber-600/20 text-amber-300 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Right side: User Info or Sound Toggle */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {deferredInstallPrompt && (
            <button
              onClick={handleInstallPwa}
              title="Instalează Aplicația CONQUIZ"
              aria-label="Instalează Aplicația"
              className="flex h-8 sm:h-9 items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-2.5 text-xs font-bold text-amber-300 hover:bg-amber-500/25 transition"
            >
              <Download className="h-3.5 w-3.5 text-amber-400" />
              <span className="hidden md:inline">Instalează</span>
            </button>
          )}
          {/* Sound Toggle - always available */}
          <button
            onClick={handleToggleSound}
            title={isMuted ? 'Activează Sunetul' : 'Dezactivează Sunetul'}
            aria-label="Toggle Sound"
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-red-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-emerald-400" />
            )}
          </button>

          {user ? (
            <>
              {/* Elo Rating Badge */}
              <div className="hidden xl:flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs whitespace-nowrap">
                <Trophy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                <span className="text-amber-300 font-mono font-bold tabular-nums">{user.rating} Elo</span>
              </div>

              {/* User Profile Avatar Card */}
              <button
                onClick={() => {
                  sound.playClick();
                  onSelectTab('profile');
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 p-1 sm:p-1.5 sm:pr-3 hover:border-slate-700 transition"
              >
                <div className="flex h-6 w-6 sm:h-7 sm:w-7 items-center justify-center rounded-lg border border-amber-500/40 bg-slate-950 text-xs sm:text-sm">
                  {user.avatar === 'av_stefan' ? '👑' : user.avatar === 'av_regina' ? '💎' : '🗡️'}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="text-xs font-bold text-slate-200 truncate max-w-[96px]">
                    {user.username}
                  </div>
                  <div className="text-[10px] text-amber-400 truncate max-w-[96px]">
                    {user.title || 'Oștean'}
                  </div>
                </div>
              </button>

              {/* Logout Button */}
              <button
                onClick={onLogout}
                title="Deconectare"
                aria-label="Deconectare"
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
              >
                <LogOut className="h-4 w-4" />
              </button>

              {/* Mobile/Tablet hamburger menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label="Toggle Navigation Menu"
                className="lg:hidden flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-300"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </>
          ) : (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] sm:text-xs font-serif font-bold text-amber-300 whitespace-nowrap">
              Autentificare Necesară
            </div>
          )}
        </div>
      </div>

      {/* Mobile/Tablet Menu Dropdown - ONLY when authenticated */}
      {user && mobileMenuOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-950/95 px-4 py-3 space-y-1.5 animate-fadeIn">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  sound.playClick();
                  onSelectTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-semibold ${
                  isActive
                    ? 'border border-amber-500/40 bg-amber-500/15 text-amber-300'
                    : 'text-slate-300 hover:bg-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
};
