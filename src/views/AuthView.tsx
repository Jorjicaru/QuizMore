import React, { useState } from 'react';
import { api } from '../services/api';
import { UserProfile } from '../types/game';
import { sound } from '../services/audio';
import { socketService } from '../services/socket';
import { Crown, Lock, Mail, User, ShieldCheck, ArrowRight } from 'lucide-react';

interface AuthViewProps {
  onSuccess: (user: UserProfile) => void;
  onCancel?: () => void;
}

export const AuthView: React.FC<AuthViewProps> = ({ onSuccess, onCancel }) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [password, setPassword] = useState('');

  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      sound.playClick();
      const res = await api.login(loginIdentifier, password);
      socketService.reconnectWithCurrentToken();
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      sound.playClick();
      const res = await api.register(regUsername, regEmail, regPassword, regConfirmPassword);
      socketService.reconnectWithCurrentToken();
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Quick 1-Click Guest Login (No account needed!)
  const handleGuestLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      sound.playClick();
      const res = await api.loginAsGuest();
      socketService.reconnectWithCurrentToken();
      onSuccess(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="flex min-h-[75vh] items-center justify-center p-4 animate-fadeIn">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-left">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 shadow-xl shadow-amber-500/20">
            <Crown className="h-8 w-8 text-slate-950" />
          </div>
          <h2 className="mt-4 font-serif text-2xl font-black text-slate-100">
            CON<span className="text-amber-400">QUIZ</span> ROMÂNIA
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Cucerește România prin cultură generală! Până la 10 jucători pe hartă.
          </p>
        </div>

        {/* Guest 1-Click Fast Access Button (Requested: "sa ti fie permis utilizator random fara cont dar si cu cont") */}
        <div className="mt-5">
          <button
            type="button"
            disabled={loading}
            onClick={handleGuestLogin}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-amber-500/60 bg-gradient-to-r from-amber-500/20 to-amber-600/20 py-3 font-serif text-xs font-bold uppercase tracking-wider text-amber-300 hover:bg-amber-500/30 hover:border-amber-400 transition active:scale-[0.98] shadow-lg shadow-amber-500/10 cursor-pointer"
          >
            <span>⚡ Intră ca Oaspete (Fără Cont)</span>
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-slate-500">
            <span className="h-px flex-1 bg-slate-800" />
            <span>SAU CONECTEAZĂ-TE CU CONT</span>
            <span className="h-px flex-1 bg-slate-800" />
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-4 flex rounded-xl border border-slate-800 bg-slate-950/80 p-1">
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setTab('login');
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              tab === 'login'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Autentificare
          </button>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              setTab('register');
              setError(null);
            }}
            className={`flex-1 rounded-lg py-2 text-xs font-bold transition ${
              tab === 'register'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Înregistrare Cont
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Login Form */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Utilizator sau Email
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="admin sau vlad@conquiz.ro"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Parolă
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 font-serif text-xs font-bold uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 transition"
            >
              <span>{loading ? 'Se conectează...' : 'Intră în Joc'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Register Form */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Nume de Utilizator</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  required
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="ex: MihaiVoda"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-500" />
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="emailul.tau@exemplu.ro"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Parolă</label>
                <input
                  type="password"
                  required
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="minim 10 caractere"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Confirmare</label>
                <input
                  type="password"
                  required
                  value={regConfirmPassword}
                  onChange={(e) => setRegConfirmPassword(e.target.value)}
                  placeholder="repetă parola"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-slate-100 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-3 font-serif text-xs font-bold uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-amber-500 disabled:opacity-50 transition"
            >
              <span>{loading ? 'Se creează contul...' : 'Creează Contul'}</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        )}

        {/* Quick Demo 1-Click Buttons */}
        <div className="mt-6 border-t border-slate-800 pt-5">
          <div className="text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Autentificare Rapidă pentru Testare
          </div>
          <div className="grid grid-cols-2 gap-2">
          </div>
        </div>
      </div>
    </div>
  );
};
