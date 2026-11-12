import React from 'react';
import { ShieldAlert, RefreshCw, Wrench } from 'lucide-react';

interface MaintenanceViewProps {
  message?: string | null;
  isRetrying?: boolean;
  onRetry: () => void;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  message,
  isRetrying = false,
  onRetry,
}) => {
  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.12),transparent_65%)] pointer-events-none" />
      <div className="relative z-10 max-w-lg w-full bg-slate-900/90 border border-amber-500/30 rounded-2xl p-8 shadow-2xl text-center">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Wrench className="w-8 h-8" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider mb-3">
          <ShieldAlert className="w-3.5 h-3.5" />
          Mentenanță tehnică
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-3">
          CONQUIZ România este în mentenanță
        </h1>
        <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
          {message ||
            'Aplicația este momentan în mentenanță sau oprită temporar. Vă rugăm să reveniți în curând.'}
        </p>
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 mb-6 text-left space-y-1.5">
          <p className="font-semibold text-slate-300">Ce se întâmplă în acest moment?</p>
          <p>
            Efectuăm lucrări rapide de actualizare sau verificare a serviciului. Conturile,
            clasamentul și istoricul meciurilor sunt păstrate în siguranță.
          </p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={isRetrying}
          className="w-full py-3.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-black text-sm uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
          {isRetrying ? 'Se verifică conexiunea...' : 'Reîncearcă'}
        </button>
      </div>
    </div>
  );
};
