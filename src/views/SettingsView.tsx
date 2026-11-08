import React, { useState } from 'react';
import { sound } from '../services/audio';
import { Settings, Volume2, VolumeX, HelpCircle, BookOpen, Shield, Crown, Swords, Castle } from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [isMuted, setIsMuted] = useState(sound.getIsMuted());

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
    if (!muted) sound.playClick();
  };

  const handleTestSound = (type: string) => {
    if (type === 'click') sound.playClick();
    else if (type === 'correct') sound.playCorrect();
    else if (type === 'wrong') sound.playWrong();
    else if (type === 'conquer') sound.playConquer();
    else if (type === 'castle') sound.playCastleHit();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fadeIn text-left">
      {/* Header */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
          <Settings className="h-4 w-4" /> Setări & Manual de Joc
        </div>
        <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-black text-slate-100">
          Configurări & Regulamentul CONQUIZ
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Află cum funcționează cucerirea celor 37 de regiuni ale României în 2 până la 10 jucători.
        </p>
      </div>

      {/* Audio & Preferences */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-emerald-400" /> Preferințe Audio
        </h3>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
          <div>
            <div className="text-sm font-bold text-slate-200">Efecte Sonore Sintentizate</div>
            <div className="text-xs text-slate-400">Sunete pentru răspunsuri, cronometru, atacuri și fanfară de victorie</div>
          </div>

          <button
            onClick={handleToggleMute}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
              isMuted
                ? 'border border-red-500/40 bg-red-500/10 text-red-400'
                : 'border border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
            }`}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            <span>{isMuted ? 'Sunet Oprit' : 'Sunet Pornit'}</span>
          </button>
        </div>

        {/* Test Sound buttons */}
        {!isMuted && (
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="text-slate-500 py-1 font-semibold text-[11px]">Testează:</span>
            <button
              onClick={() => handleTestSound('click')}
              className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-slate-300 hover:bg-slate-800"
            >
              Click
            </button>
            <button
              onClick={() => handleTestSound('correct')}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-300 hover:bg-emerald-500/20"
            >
              Corect 🔔
            </button>
            <button
              onClick={() => handleTestSound('wrong')}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-300 hover:bg-red-500/20"
            >
              Greșit ❌
            </button>
            <button
              onClick={() => handleTestSound('conquer')}
              className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-300 hover:bg-amber-500/20"
            >
              Cucerire 🎺
            </button>
            <button
              onClick={() => handleTestSound('castle')}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-red-400 hover:bg-red-500/20"
            >
              Lovitură Castel 🏰
            </button>
          </div>
        )}
      </div>

      {/* Complete Rules Guide */}
      <div className="rounded-3xl border border-slate-800 bg-slate-900/40 p-6 space-y-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800 pb-3">
          <BookOpen className="h-4 w-4 text-amber-400" /> Ghidul Cuceritorului CONQUIZ
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm mb-2">
              <Castle className="h-4 w-4" /> 1. Alegerea Bazei
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Fiecare jucător își alege o regiune liberă pe harta României pentru a-și stabili <strong>Castelul Principal</strong> (+400 pct). Castelul are 3 turnuri de viață. Dacă este cucerit în totalitate, jucătorul este eliminat!
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-2">
              <Crown className="h-4 w-4" /> 2. Expansiune Teritorială
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Jucătorii cuceresc teritorii neutre adiacente stăpânirilor proprii prin răspunsuri corecte la întrebări de cultură generală sau estimare numerică (+200-280 pct per regiune).
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm mb-2">
              <Swords className="h-4 w-4" /> 3. Război & Asediu
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Jucătorul activ declară atac pe un teritoriu inamic vecin. Ambii jucători primesc întrebarea: răspunsul corect și viteza decid deznodământul! Cuceritorul preia punctele și teritoriul.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-slate-300">
          <span className="font-bold text-amber-400">💡 Notă Tehnică Despre Hartă: </span>
          Harta României din CONQUIZ a fost împărțită geometric în <strong>37 de județe și sub-regiuni distincte</strong>, permițând meciuri palpitante și echilibrate pentru <strong>2, 3, 4, 6 sau până la 10 jucători simultan</strong>!
        </div>
      </div>
    </div>
  );
};
