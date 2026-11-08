import React, { useState, useEffect, useRef } from 'react';
import { ActiveQuestionState, Player } from '../types/game';
import { sound } from '../services/audio';
import { Clock, HelpCircle, CheckCircle2, XCircle, Swords, Delete, Send, RotateCcw } from 'lucide-react';

interface QuestionModalProps {
  activeQuestion: ActiveQuestionState;
  players: Player[];
  currentUserId?: string;
  onSubmitAnswer: (answer: number | string) => void;
}

export const QuestionModal: React.FC<QuestionModalProps> = ({
  activeQuestion,
  players,
  currentUserId,
  onSubmitAnswer,
}) => {
  const { question, startTime, durationSeconds, attackerId, defenderId, phaseContext, playerAnswers, resolved } = activeQuestion;

  const [progressPercent, setProgressPercent] = useState<number>(100);
  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [estimationInput, setEstimationInput] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const attacker = players.find(p => p.id === attackerId);
  const defender = defenderId ? players.find(p => p.id === defenderId) : null;

  // In conquest and allocation, ALL players answer simultaneously!
  // In battle (war), attacker and defender duel.
  const isParticipant =
    !!currentUserId &&
    (phaseContext === 'allocation' || phaseContext === 'conquest'
      ? true
      : phaseContext === 'war'
      ? currentUserId === attackerId || currentUserId === defenderId
      : false);

  const hasSubmitted = currentUserId ? playerAnswers[currentUserId] !== undefined : false;

  // Auto-clear input and selected choice whenever question changes
  useEffect(() => {
    setEstimationInput('');
    setSelectedOption(null);
  }, [question.id, startTime]);

  // Auto-focus input for physical keyboard typing
  useEffect(() => {
    if (question.type === 'estimation' && !hasSubmitted && !resolved && isParticipant) {
      inputRef.current?.focus();
    }
  }, [question.type, hasSubmitted, resolved, isParticipant]);

  // Buttery-smooth 30ms countdown timer effect (continuous fluid drainage, no chunky drops)
  useEffect(() => {
    const totalMs = durationSeconds * 1000;
    const tick = () => {
      const elapsedMs = Date.now() - startTime;
      const remainingMs = Math.max(0, totalMs - elapsedMs);
      const pct = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
      setProgressPercent(pct);

      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(prev => {
        if (remainingSec <= 4 && remainingSec > 0 && remainingSec !== prev && !resolved) {
          sound.playTick();
        }
        return remainingSec;
      });
    };

    tick();
    const interval = setInterval(tick, 30); // 30ms for silky smooth animation
    return () => clearInterval(interval);
  }, [startTime, durationSeconds, resolved]);

  // Audio trigger on question resolve
  useEffect(() => {
    if (resolved && currentUserId && playerAnswers[currentUserId]) {
      const mySub = playerAnswers[currentUserId];
      if (question.type === 'choice') {
        if (Number(mySub.answer) === question.correctAnswerIndex) {
          sound.playCorrect();
        } else {
          sound.playWrong();
        }
      } else {
        sound.playConquer();
      }
    }
  }, [resolved, currentUserId, playerAnswers, question]);

  const handleSelectChoice = (index: number) => {
    if (hasSubmitted || resolved || !isParticipant) return;
    sound.playClick();
    setSelectedOption(index);
    onSubmitAnswer(index);
  };

  const handleEstimationSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (hasSubmitted || resolved || !isParticipant || !estimationInput.trim()) return;
    const num = Number(estimationInput.replace(',', '.'));
    if (isNaN(num)) return;
    sound.playClick();
    onSubmitAnswer(num);
  };

  // Virtual Keypad Handlers
  const handleKeypadPress = (digit: string) => {
    if (hasSubmitted || resolved || !isParticipant) return;
    sound.playClick();
    setEstimationInput(prev => {
      const next = prev + digit;
      if (next.length > 16 || !/^-?\d*(?:[.,]\d*)?$/.test(next)) return prev;
      return next;
    });
  };

  const handleBackspace = () => {
    if (hasSubmitted || resolved || !isParticipant) return;
    sound.playClick();
    setEstimationInput(prev => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (hasSubmitted || resolved || !isParticipant) return;
    sound.playClick();
    setEstimationInput('');
  };

  const timerColor = timeLeft > 7 ? 'bg-emerald-500' : timeLeft > 3 ? 'bg-amber-500' : 'bg-red-500';

  const categoryNames: Record<string, string> = {
    istorie: 'Istorie',
    geografie: 'Geografie',
    biologie: 'Biologie',
    fizica: 'Fizică',
    chimie: 'Chimie',
    matematica: 'Matematică',
    literatura: 'Literatură',
    arta: 'Artă & Arhitectură',
    sport: 'Sport',
    muzica: 'Muzică',
    cinematografie: 'Cinematografie',
    cultura_generala: 'Cultură Generală',
    tehnologie: 'Tehnologie',
    informatica: 'Informatică',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/85 p-3 sm:p-4 backdrop-blur-md select-none animate-fadeIn">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border-2 border-amber-500/40 bg-stone-900/98 shadow-[0_0_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
        {/* Top Header */}
        <div className="border-b border-stone-800 bg-gradient-to-r from-stone-950 via-stone-900 to-stone-950 px-5 sm:px-6 py-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 font-serif text-xs font-bold uppercase tracking-wider text-amber-300">
                {categoryNames[question.category] || question.category}
              </span>
              <span className="rounded-lg border border-stone-700 bg-stone-800/80 px-2.5 py-1 text-xs font-medium text-stone-300 capitalize">
                Dificultate: {question.difficulty}
              </span>
            </div>

            {/* Timer Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-950 px-3.5 py-1 font-mono text-sm font-bold shadow-inner">
              <Clock className={`h-4 w-4 ${timeLeft <= 4 ? 'text-red-500 animate-spin' : 'text-amber-400'}`} />
              <span className={timeLeft <= 4 ? 'text-red-400 font-black' : 'text-stone-100'}>
                {timeLeft}s
              </span>
            </div>
          </div>

          {/* Confrontation row if Battle Duel */}
          {phaseContext === 'war' && attacker && defender && (
            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/70 p-2 px-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🗡️</span>
                <div className="text-left">
                  <div className="text-xs font-bold text-stone-200">{attacker.username}</div>
                  <div className="text-[10px] text-amber-400 font-bold">⚔️ ATACATOR</div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-3">
                <Swords className="h-5 w-5 text-red-500 animate-pulse" />
                <span className="text-xs font-mono font-bold text-stone-400">DUEL (400 PCT)</span>
              </div>

              <div className="flex items-center gap-2 text-right">
                <div className="text-right">
                  <div className="text-xs font-bold text-stone-200">{defender.username}</div>
                  <div className="text-[10px] text-blue-400 font-bold">🛡️ APĂRĂTOR</div>
                </div>
                <span className="text-xl">🛡️</span>
              </div>
            </div>
          )}

          {/* Progress Timer Line (Smooth 30ms drainage) */}
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-stone-950 border border-stone-800/80">
            <div
              className={`h-full ${timerColor}`}
              style={{ width: `${progressPercent}%`, transition: 'none' }}
            />
          </div>
        </div>

        {/* Question Text */}
        <div className="px-6 py-4 text-center">
          <h3 className="font-serif text-lg sm:text-xl font-bold leading-relaxed text-stone-100">
            {question.question}
          </h3>
          {question.type === 'estimation' && (
            <p className="mt-1 text-xs text-amber-300 font-semibold font-mono">
              Introdu numărul estimat {question.unit ? `(${question.unit})` : ''} - de la tastatură fizică sau ecran:
            </p>
          )}
        </div>

        {/* Question Body: Choice or Estimation */}
        <div className="px-5 sm:px-6 pb-5">
          {/* TYPE 1: 4 CHOICES */}
          {question.type === 'choice' && question.options && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {question.options.map((option, index) => {
                const isSelected = selectedOption === index || (currentUserId && playerAnswers[currentUserId]?.answer === index);
                const isCorrect = resolved && index === question.correctAnswerIndex;
                const isWrong = resolved && isSelected && index !== question.correctAnswerIndex;

                let btnStyle = 'border-stone-800 bg-stone-800/70 hover:bg-stone-800 hover:border-stone-600 text-stone-200';

                if (isSelected && !resolved) {
                  btnStyle = 'border-amber-500 bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/50';
                } else if (isCorrect) {
                  btnStyle = 'border-emerald-500 bg-emerald-500/30 text-emerald-300 font-bold ring-2 ring-emerald-500';
                } else if (isWrong) {
                  btnStyle = 'border-red-500 bg-red-500/30 text-red-300 line-through opacity-80';
                }

                return (
                  <button
                    key={index}
                    disabled={hasSubmitted || resolved || !isParticipant}
                    onClick={() => handleSelectChoice(index)}
                    className={`relative flex items-center justify-between rounded-2xl border p-4 text-left transition-all active:scale-[0.98] ${btnStyle} ${
                      !isParticipant ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-700 bg-stone-950 font-mono text-xs font-bold text-amber-400">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="text-sm font-medium leading-snug">{option}</span>
                    </div>

                    {isCorrect && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 ml-2" />}
                    {isWrong && <XCircle className="h-5 w-5 text-red-400 shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* TYPE 2: NUMERIC ESTIMATION WITH VIRTUAL KEYPAD + PHYSICAL INPUT */}
          {question.type === 'estimation' && (
            <div className="space-y-4">
              <form onSubmit={handleEstimationSubmit} className="flex flex-col items-center">
                {/* Physical Keyboard Input Field */}
                <div className="relative w-full max-w-sm">
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={hasSubmitted || resolved || !isParticipant}
                    value={estimationInput}
                    onKeyDown={(e) => {
                      if (['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key) || e.ctrlKey || e.metaKey) return;
                      if (/^[0-9]$/.test(e.key)) {
                        if (estimationInput.length >= 16) e.preventDefault();
                        return;
                      }
                      if (e.key === '-' && (e.currentTarget.selectionStart ?? 0) === 0 && !estimationInput.includes('-')) return;
                      if ((e.key === '.' || e.key === ',') && !/[.,]/.test(estimationInput)) return;
                      e.preventDefault();
                    }}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '.');
                      if (/^-?\d*(?:\.\d*)?$/.test(raw) && raw.length <= 16) setEstimationInput(raw);
                    }}
                    placeholder="Tastează numărul..."
                    className="w-full rounded-2xl border-2 border-amber-500/50 bg-stone-950 px-4 py-3 text-center font-mono text-2xl font-black text-amber-300 placeholder-stone-600 focus:border-amber-400 focus:outline-none focus:ring-4 focus:ring-amber-500/20"
                  />
                  {question.unit && (
                    <span className="absolute right-4 top-4 text-xs font-mono font-bold text-stone-400">
                      {question.unit}
                    </span>
                  )}
                </div>

                {/* On-Screen Virtual Keypad (Requested: "adauga la acest tip de raspuns cu numere si o tastatura pe care poti apasa") */}
                {!hasSubmitted && !resolved && isParticipant && (
                  <div className="mt-4 w-full max-w-xs space-y-2">
                    {/* Rows 1-3 */}
                    <div className="grid grid-cols-3 gap-2">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                        <button
                          key={digit}
                          type="button"
                          onClick={() => handleKeypadPress(digit)}
                          className="flex h-11 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/90 font-mono text-lg font-bold text-stone-100 hover:bg-stone-700 hover:border-amber-500/50 active:scale-95 transition shadow"
                        >
                          {digit}
                        </button>
                      ))}
                    </div>

                    {/* Bottom Row: sign, zero, decimal separator, clear/delete */}
                    <div className="grid grid-cols-4 gap-2">
                      <button type="button" onClick={() => { if (!hasSubmitted && !resolved && isParticipant) setEstimationInput(prev => prev.startsWith('-') ? prev.slice(1) : `-${prev}`); }} className="flex h-11 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/80 font-mono text-lg font-bold text-stone-100">±</button>
                      <button type="button" onClick={() => handleKeypadPress('0')} className="flex h-11 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/90 font-mono text-lg font-bold text-stone-100">0</button>
                      <button type="button" onClick={() => handleKeypadPress('.')} className="flex h-11 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/90 font-mono text-lg font-bold text-stone-100">.</button>
                      <button type="button" onClick={handleBackspace} title="Șterge ultimul caracter" className="flex h-11 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/80 font-mono text-sm font-bold text-amber-300"><Delete className="h-4 w-4" /></button>
                    </div>
                    <button type="button" onClick={handleClear} title="Șterge tot" className="w-full rounded-xl border border-stone-700 bg-stone-800/80 py-2 text-xs font-bold text-red-300">Resetează răspunsul</button>

                    {/* Submit Button */}
                    <button
                      type="button"
                      disabled={!estimationInput.trim()}
                      onClick={() => handleEstimationSubmit()}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 py-3 font-serif text-sm font-bold uppercase tracking-wider text-stone-950 shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 transition cursor-pointer"
                    >
                      <Send className="h-4 w-4" />
                      <span>Trimite Răspunsul</span>
                    </button>
                  </div>
                )}
              </form>

              {/* Soluție & Comparație când runda este rezolvată */}
              {resolved && (
                <div className="mt-4 rounded-2xl border border-amber-500/40 bg-stone-950/90 p-4 text-center">
                  <div className="font-serif text-xs uppercase tracking-wider text-amber-400 font-bold mb-1">
                    Răspunsul Exact
                  </div>
                  <div className="text-3xl font-mono font-black text-amber-300">
                    {question.targetNumber} {question.unit}
                  </div>

                  {/* Submissions of players */}
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {Object.entries(playerAnswers).map(([pid, sub]) => {
                      const p = players.find(x => x.id === pid);
                      const diff = Math.abs(Number(sub.answer) - (question.targetNumber || 0));
                      return (
                        <div key={pid} className="rounded-xl border border-stone-800 bg-stone-900 px-3 py-1.5 text-xs text-stone-200">
                          <span className="font-bold" style={{ color: p?.color }}>{p?.username}: </span>
                          <span className="font-mono text-amber-300 font-bold">{sub.answer}</span>
                          <span className="text-stone-400 ml-1.5 font-mono">(&plusmn;{diff})</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Explanation if question resolved */}
          {resolved && question.explanation && (
            <div className="mt-4 rounded-2xl border border-stone-800 bg-stone-950/70 p-3.5 text-xs text-stone-300 text-left flex items-start gap-2.5">
              <HelpCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-stone-200">Știai că? </span>
                {question.explanation}
              </div>
            </div>
          )}

          {/* Status notice */}
          {!isParticipant && (
            <div className="mt-3 text-center text-xs text-stone-400 italic">
              Ești observator la această întrebare.
            </div>
          )}

          {hasSubmitted && !resolved && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-amber-400">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
              </span>
              Răspunsul tău a fost înregistrat! Se așteaptă finalizarea timpului...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
