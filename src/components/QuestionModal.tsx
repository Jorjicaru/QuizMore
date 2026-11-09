import React, { useState, useEffect, useRef } from 'react';
import { ActiveQuestionState, Player, WarRoundState } from '../types/game';
import { sound } from '../services/audio';
import {
  Clock,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Swords,
  Delete,
  Send,
  Trophy,
  AlertCircle,
} from 'lucide-react';

interface QuestionModalProps {
  activeQuestion: ActiveQuestionState;
  players: Player[];
  currentUserId?: string;
  warRound?: WarRoundState | null;
  onSubmitAnswer: (
    answer: number | string,
    cb?: (res: { success: boolean; message?: string; acceptedAnswer?: number }) => void
  ) => void;
}

type SubmitStatus = 'idle' | 'submitting' | 'accepted' | 'rejected' | 'expired';

function formatSubmitTimeSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '--,--s';
  const sec = Math.max(0, ms / 1000);
  return sec.toFixed(2).replace('.', ',') + 's';
}

export const QuestionModal: React.FC<QuestionModalProps> = ({
  activeQuestion,
  players,
  currentUserId,
  warRound,
  onSubmitAnswer,
}) => {
  const {
    questionInstanceId,
    question,
    startTime,
    durationSeconds,
    attackerId,
    defenderId,
    phaseContext,
    participantIds,
    winnerIds,
    playerAnswers,
    resolved,
  } = activeQuestion;

  const instanceKey = questionInstanceId || `${question.id}_${startTime}`;

  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [estimationInput, setEstimationInput] = useState<string>('');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Smooth RAF countdown timer DOM ref
  const progressBarRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const prevTickSecRef = useRef<number>(-1);

  // Immediate synchronous lock to prevent double-click / double-Enter before state re-renders
  const submittingLockRef = useRef<boolean>(false);
  const activeInstanceKeyRef = useRef<string>(instanceKey);
  const inputRef = useRef<HTMLInputElement>(null);

  const effectiveParticipants =
    participantIds && participantIds.length > 0
      ? participantIds
      : phaseContext === 'war'
      ? [attackerId, defenderId!].filter(Boolean)
      : players.filter((p) => !p.isEliminated).map((p) => p.id);

  const isParticipant = Boolean(currentUserId && effectiveParticipants.includes(currentUserId));

  // Strict check using hasOwnProperty so option 0 is recognized as submitted
  const hasServerRecord = Boolean(
    currentUserId && Object.prototype.hasOwnProperty.call(playerAnswers, currentUserId)
  );
  const isLocked =
    submittingLockRef.current ||
    submitStatus === 'submitting' ||
    submitStatus === 'accepted' ||
    submitStatus === 'expired' ||
    hasServerRecord ||
    resolved ||
    !isParticipant;

  // Reset all local states when a new question instance arrives
  useEffect(() => {
    activeInstanceKeyRef.current = instanceKey;
    submittingLockRef.current = false;
    setSubmitStatus('idle');
    setSubmitError(null);
    setEstimationInput('');
    setSelectedOption(null);
  }, [instanceKey]);

  // Sync with server state if server already recorded our answer
  useEffect(() => {
    if (hasServerRecord && submitStatus !== 'accepted' && !resolved) {
      submittingLockRef.current = true;
      setSubmitStatus('accepted');
    }
  }, [hasServerRecord, submitStatus, resolved]);

  // Auto-focus input for physical keyboard typing on desktop
  useEffect(() => {
    if (
      question.type === 'estimation' &&
      !isLocked &&
      !resolved &&
      isParticipant &&
      window.innerWidth >= 768
    ) {
      inputRef.current?.focus();
    }
  }, [question.type, isLocked, resolved, isParticipant, instanceKey]);

  // Smooth RAF countdown timer effect with direct DOM transform scaleX (zero re-render overhead)
  useEffect(() => {
    const totalMs = durationSeconds * 1000;
    const deadline = startTime + totalMs;

    if (resolved) {
      if (progressBarRef.current) {
        progressBarRef.current.style.transform = 'scaleX(0)';
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    const update = () => {
      const now = Date.now();
      const remainingMs = Math.max(0, deadline - now);
      const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));

      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${ratio})`;
        const remSec = Math.ceil(remainingMs / 1000);
        if (remSec <= 3) {
          progressBarRef.current.style.backgroundColor = '#ef4444'; // red-500
        } else if (remSec <= 7) {
          progressBarRef.current.style.backgroundColor = '#f59e0b'; // amber-500
        } else {
          progressBarRef.current.style.backgroundColor = '#10b981'; // emerald-500
        }
      }

      const currentSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      if (currentSeconds !== prevTickSecRef.current) {
        prevTickSecRef.current = currentSeconds;
        if (currentSeconds <= 4 && currentSeconds > 0 && !resolved) {
          sound.playTick();
        }
        setTimeLeft(currentSeconds);
      }

      if (remainingMs <= 0 && !resolved && !hasServerRecord && submitStatus === 'idle') {
        setSubmitStatus('expired');
      }

      if (remainingMs > 0 && !resolved) {
        rafIdRef.current = requestAnimationFrame(update);
      } else {
        rafIdRef.current = null;
      }
    };

    update();

    const handleVisibilityChange = () => {
      if (!document.hidden && deadline > Date.now() && !resolved) {
        if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
        update();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [startTime, durationSeconds, resolved, hasServerRecord, submitStatus]);

  // Audio trigger on question resolve
  useEffect(() => {
    if (resolved && currentUserId && playerAnswers[currentUserId]) {
      const mySub = playerAnswers[currentUserId];
      if (mySub.answer === null || mySub.answerStatus === 'NO_RESPONSE') {
        sound.playWrong();
      } else if (question.type === 'choice') {
        if (Number(mySub.answer) === question.correctAnswerIndex) {
          sound.playCorrect();
        } else {
          sound.playWrong();
        }
      } else {
        if (winnerIds?.includes(currentUserId) || mySub.isCorrect) {
          sound.playConquer();
        } else {
          sound.playClick();
        }
      }
    }
  }, [resolved, currentUserId, playerAnswers, question, winnerIds]);

  const handleSelectChoice = (index: number) => {
    if (submittingLockRef.current || isLocked) return;
    submittingLockRef.current = true;
    const currentKey = instanceKey;
    sound.playClick();
    setSelectedOption(index);
    setSubmitStatus('submitting');
    setSubmitError(null);

    onSubmitAnswer(index, (res) => {
      if (activeInstanceKeyRef.current !== currentKey) return;
      if (!res || res.success) {
        setSubmitStatus('accepted');
        setSubmitError(null);
      } else {
        if (res.message?.includes('deja')) {
          setSubmitStatus('accepted');
          setSubmitError(null);
        } else if (res.message?.includes('expirat')) {
          setSubmitStatus('expired');
          setSubmitError(res.message);
        } else {
          submittingLockRef.current = false;
          setSubmitStatus('rejected');
          setSelectedOption(null);
          setSubmitError(res.message || 'Răspuns respins de server.');
        }
      }
    });
  };

  const handleEstimationSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submittingLockRef.current || isLocked) return;
    const raw = estimationInput.trim().replace(',', '.');
    if (!raw || raw === '-' || raw === '.' || raw === '-.') return;
    const num = Number(raw);
    if (!Number.isFinite(num)) {
      setSubmitError('Introdu un număr valid!');
      return;
    }

    submittingLockRef.current = true;
    const currentKey = instanceKey;
    sound.playClick();
    setSubmitStatus('submitting');
    setSubmitError(null);

    onSubmitAnswer(num, (res) => {
      if (activeInstanceKeyRef.current !== currentKey) return;
      if (!res || res.success) {
        setSubmitStatus('accepted');
        setSubmitError(null);
      } else {
        if (res.message?.includes('deja')) {
          setSubmitStatus('accepted');
          setSubmitError(null);
        } else if (res.message?.includes('expirat')) {
          setSubmitStatus('expired');
          setSubmitError(res.message);
        } else {
          submittingLockRef.current = false;
          setSubmitStatus('rejected');
          setSubmitError(res.message || 'Valoare invalidă.');
        }
      }
    });
  };

  const handleKeypadPress = (digit: string) => {
    if (isLocked) return;
    sound.playClick();
    setEstimationInput((prev) => {
      const next = prev + digit;
      if (next.length > 16 || !/^-?\d*(?:[.,]\d*)?$/.test(next)) return prev;
      return next;
    });
  };

  const handleBackspace = () => {
    if (isLocked) return;
    sound.playClick();
    setEstimationInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    if (isLocked) return;
    sound.playClick();
    setEstimationInput('');
  };

  const categoryNames: Record<string, string> = {
    istorie: 'Istorie',
    geografie: 'Geografie',
    biologie: 'Biologie',
    fizica: 'Fizică',
    chimie: 'Chimie',
    matematica: 'Matematică',
    literatura: 'Literatură',
    arta: 'Artă',
    sport: 'Sport',
    muzica: 'Muzică',
    cinematografie: 'Cinematografie',
    film: 'Film',
    cultura_generala: 'Cultură Generală',
    tehnologie: 'Tehnologie',
    stiinta: 'Știință',
    astronomie: 'Astronomie',
    informatica: 'Informatică',
  };

  // Count how many participants have answered so far
  const answeredCount = effectiveParticipants.filter((pid) => {
    const sub = playerAnswers[pid];
    if (!sub) return false;
    if (!resolved) return true; // In unresolved state, presence in playerAnswers means submitted
    return sub.answer !== null && sub.answerStatus !== 'NO_RESPONSE';
  }).length;

  // Determine personal outcome banner when resolved
  const renderPersonalOutcomeBanner = () => {
    if (!resolved || !currentUserId || !isParticipant) return null;
    const mySub = playerAnswers[currentUserId];
    const isNoResponse = !mySub || mySub.answer === null || mySub.answerStatus === 'NO_RESPONSE';
    const isWinner = Boolean(winnerIds?.includes(currentUserId));

    if (isNoResponse) {
      return (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-stone-600 bg-stone-900/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-stone-300">
          <Clock className="h-4 w-4 text-amber-400 shrink-0" />
          <span>TIMP EXPIRAT — Nu ai trimis niciun răspuns la această întrebare.</span>
        </div>
      );
    }

    if (question.type === 'choice') {
      const isCorr = Number(mySub.answer) === question.correctAnswerIndex;
      if (isCorr) {
        return (
          <div className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-emerald-400/80 bg-emerald-950/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-emerald-200 shadow-lg">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>
              {phaseContext === 'conquest'
                ? 'RĂSPUNS CORECT! Ai câștigat dreptul de a alege un teritoriu învecinat (+200 PCT)!'
                : 'RĂSPUNS CORECT!'}
            </span>
          </div>
        );
      }
      return (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-red-500/70 bg-red-950/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-red-200">
          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>
            {phaseContext === 'conquest'
              ? 'RĂSPUNS GREȘIT! Nu primești teritoriu în această rundă.'
              : 'RĂSPUNS GREȘIT!'}
          </span>
        </div>
      );
    }

    // Numeric estimation
    if (isWinner) {
      return (
        <div className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-amber-400 bg-amber-950/90 px-3.5 py-2 text-xs sm:text-sm font-bold text-amber-200 shadow-lg">
          <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            {phaseContext === 'allocation'
              ? 'CEL MAI APROPIAT RĂSPUNS! Urmează să alegi un teritoriu liber (+300 PCT)!'
              : 'AI CÂȘTIGAT DEPARTAJAREA NUMERICĂ!'}
          </span>
        </div>
      );
    }
    return (
      <div className="mb-3 flex items-center justify-center gap-2 rounded-xl border border-stone-700 bg-stone-900/90 px-3.5 py-2 text-xs sm:text-sm font-semibold text-stone-300">
        <span>Alt jucător a fost mai aproape de răspunsul corect.</span>
      </div>
    );
  };

  // Active battles to display in War mode
  const activeWarBattles =
    phaseContext === 'war' && warRound?.battles
      ? warRound.battles.filter((b) => {
          if (activeQuestion.isTiebreak) {
            return (
              effectiveParticipants.includes(b.attackerId) ||
              effectiveParticipants.includes(b.defenderId)
            );
          }
          return b.targetTerritoryId !== null;
        })
      : [];

  return (
    <div
      data-testid="question-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/85 p-2 sm:p-4 backdrop-blur-md select-none animate-fadeIn"
    >
      <div className="relative flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-amber-500/50 bg-[#2b1810]/98 shadow-[0_0_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
        {/* Top Header */}
        <div className="shrink-0 border-b border-amber-900/60 bg-gradient-to-r from-[#1e100a] via-[#2d1910] to-[#1e100a] px-3.5 sm:px-6 py-2.5 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 font-serif text-[11px] sm:text-xs font-bold uppercase tracking-wider text-amber-300">
                {categoryNames[question.category] || question.category}
              </span>
              <span className="rounded-lg border border-stone-700 bg-stone-900/80 px-2 py-0.5 text-[11px] sm:text-xs font-medium text-stone-300">
                {answeredCount} / {effectiveParticipants.length} răspunsuri
              </span>
            </div>

            {/* Timer Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-stone-950 px-3 py-0.5 font-mono text-xs sm:text-sm font-bold shadow-inner shrink-0 tabular-nums">
              <Clock
                className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                  timeLeft <= 4 && !resolved ? 'text-red-500 animate-pulse' : 'text-amber-400'
                }`}
              />
              <span
                className={
                  timeLeft <= 4 && !resolved ? 'text-red-400 font-black' : 'text-stone-100'
                }
              >
                {resolved ? 'FINAL' : `${timeLeft}s`}
              </span>
            </div>
          </div>

          {/* Confrontation row(s) if War Phase */}
          {phaseContext === 'war' && activeWarBattles.length > 0 && (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {activeWarBattles.map((b) => {
                const atk = players.find((p) => p.id === b.attackerId);
                const def = players.find((p) => p.id === b.defenderId);
                const isMyDuel =
                  currentUserId === b.attackerId || currentUserId === b.defenderId;
                return (
                  <div
                    key={b.battleId}
                    className={`flex items-center justify-between rounded-xl border px-2.5 py-1.5 text-xs ${
                      isMyDuel
                        ? 'border-amber-400/70 bg-stone-950/90 ring-1 ring-amber-400/30'
                        : 'border-stone-800 bg-stone-950/65'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: atk?.color }}
                      />
                      <span className="font-bold text-stone-100 truncate">
                        {atk?.username || 'Atacator'}
                      </span>
                      <span className="text-[9px] text-amber-400 font-bold shrink-0">⚔️</span>
                    </div>

                    <Swords className="h-3.5 w-3.5 text-red-400 shrink-0 mx-1" />

                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] text-sky-400 font-bold shrink-0">🛡️</span>
                      <span className="font-bold text-stone-100 truncate">
                        {def?.username || 'Apărător'}
                      </span>
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: def?.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress Timer Line (Smooth RAF Animation) */}
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-950 border border-stone-800/80">
            <div
              ref={progressBarRef}
              className="h-full w-full origin-left will-change-transform bg-emerald-500"
              style={{ transform: resolved ? 'scaleX(0)' : 'scaleX(1)' }}
            />
          </div>
        </div>

        {/* Scrollable Inner Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3.5 sm:px-6 py-3 sm:py-5">
          {/* Personal Outcome Banner on Resolution */}
          {renderPersonalOutcomeBanner()}

          {/* Question Banner & Target Number Box (Matches Screenshot_2026-11-09_005401_7b10899b.png) */}
          <div
            className={`mb-4 rounded-2xl border border-amber-900/70 bg-gradient-to-b from-[#4a2618] to-[#361b10] p-3.5 sm:p-5 shadow-inner ${
              resolved && question.type === 'estimation'
                ? 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'
                : 'text-center'
            }`}
          >
            <div className={resolved && question.type === 'estimation' ? 'flex-1 text-center sm:text-left' : ''}>
              <h3 className="font-serif text-base sm:text-xl font-bold leading-snug sm:leading-relaxed text-amber-50">
                {question.question}
              </h3>
              {question.type === 'estimation' && !resolved && (
                <p className="mt-1 text-[11px] sm:text-xs text-amber-300 font-semibold font-mono">
                  Introdu numărul estimat {question.unit ? `(${question.unit})` : ''}:
                </p>
              )}
            </div>

            {/* Top-Right "Răspuns corect: 1887" Badge when resolved on numeric estimation */}
            {resolved && question.type === 'estimation' && (
              <div className="shrink-0 flex flex-col items-center justify-center rounded-xl border border-amber-500/40 bg-[#2a150d] px-4 py-2.5 shadow-lg">
                <span className="text-[11px] sm:text-xs font-serif font-semibold text-amber-200/90 mb-1">
                  Răspuns corect:
                </span>
                <div className="min-w-[110px] rounded-xl border-2 border-amber-400 bg-[#1a0d08] px-4 py-1 text-center font-serif text-xl sm:text-2xl font-black text-amber-100 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
                  {question.targetNumber} {question.unit || ''}
                </div>
              </div>
            )}
          </div>

          {/* ============================================================
              TYPE 1: MULTIPLE CHOICE (4 OPTIONS)
              Matches Screenshot_2026-11-09_005523_d1157b77.png:
              - Before resolution: highlights only current player's locked choice
              - After resolution: colors chosen options with choosing players' colors,
                highlights the correct answer with a golden/emerald frame, and displays
                player badges + response times on each chosen option.
          ============================================================ */}
          {question.type === 'choice' && question.options && (
            <div
              data-testid={resolved ? 'choice-resolved-options' : 'choice-options'}
              className="space-y-2.5 sm:space-y-3 max-w-xl mx-auto"
            >
              {question.options.map((option, index) => {
                const myAnswer =
                  currentUserId && playerAnswers[currentUserId]?.answer !== null && playerAnswers[currentUserId]?.answer !== undefined
                    ? Number(playerAnswers[currentUserId].answer)
                    : selectedOption;
                const isSelectedByMe = myAnswer === index;
                const isCorrect = resolved && index === question.correctAnswerIndex;

                // All players who selected this option (available once resolved)
                const choosers = resolved
                  ? players.filter((p) => {
                      const sub = playerAnswers[p.id];
                      return (
                        sub &&
                        sub.answer !== null &&
                        sub.answer !== undefined &&
                        Number(sub.answer) === index
                      );
                    })
                  : [];

                const isChosenWrong = resolved && !isCorrect && choosers.length > 0;

                // Build background style from choosing players' colors when resolved (like Screenshot 2)
                let customBgStyle: React.CSSProperties = {};
                if (resolved && choosers.length === 1) {
                  const c = choosers[0].color;
                  customBgStyle = {
                    background: `linear-gradient(180deg, ${c}dd 0%, ${c}aa 100%)`,
                  };
                } else if (resolved && choosers.length > 1) {
                  const stops = choosers
                    .map((p, i) => {
                      const startPct = Math.round((i / choosers.length) * 100);
                      const endPct = Math.round(((i + 1) / choosers.length) * 100);
                      return `${p.color}cc ${startPct}%, ${p.color}cc ${endPct}%`;
                    })
                    .join(', ');
                  customBgStyle = {
                    background: `linear-gradient(90deg, ${stops})`,
                  };
                }

                let frameClasses =
                  'border-stone-700 bg-stone-900/90 hover:bg-stone-800 hover:border-amber-500/50 text-stone-100';

                if (!resolved && isSelectedByMe) {
                  frameClasses =
                    'border-amber-400 bg-amber-500/25 text-amber-100 ring-2 ring-amber-400/70 shadow-lg';
                } else if (resolved && isCorrect) {
                  frameClasses =
                    'border-amber-300 ring-4 ring-amber-400/90 text-white font-black shadow-[0_0_25px_rgba(245,158,11,0.5)]';
                  if (choosers.length === 0) {
                    customBgStyle = {
                      background: 'linear-gradient(180deg, #059669dd 0%, #047857cc 100%)',
                    };
                  }
                } else if (isChosenWrong) {
                  frameClasses = 'border-red-400/80 text-white font-bold shadow-md';
                } else if (resolved) {
                  frameClasses = 'border-stone-800 bg-stone-950/75 text-stone-400 opacity-80';
                }

                return (
                  <button
                    key={index}
                    type="button"
                    data-testid={`choice-option-${index}`}
                    disabled={isLocked}
                    onClick={() => handleSelectChoice(index)}
                    style={customBgStyle}
                    className={`relative flex w-full min-h-[50px] flex-col justify-center rounded-xl sm:rounded-2xl border-2 px-4 py-2.5 sm:py-3 text-center transition-all ${frameClasses} ${
                      isLocked ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-black/40 font-mono text-xs font-bold text-amber-300">
                        {String.fromCharCode(65 + index)}
                      </span>

                      <span className="flex-1 text-center font-serif text-sm sm:text-base font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                        {option}
                      </span>

                      <div className="flex items-center gap-1 shrink-0">
                        {isCorrect && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-950/90 border border-emerald-400 px-2 py-0.5 text-[10px] font-mono font-black text-emerald-300 shadow">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            CORECT
                          </span>
                        )}
                        {isChosenWrong && (
                          <XCircle className="h-5 w-5 text-red-200 drop-shadow shrink-0" />
                        )}
                      </div>
                    </div>

                    {/* Player Badges on Selected Option when Resolved */}
                    {resolved && choosers.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5 border-t border-white/20 pt-1.5">
                        {choosers.map((p) => {
                          const sub = playerAnswers[p.id];
                          return (
                            <span
                              key={p.id}
                              className="inline-flex items-center gap-1 rounded-full bg-black/65 border border-white/25 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-white shadow"
                            >
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: p.color }}
                              />
                              <span>{p.username}</span>
                              {sub?.submitTime !== undefined && sub?.submitTime !== null && (
                                <span className="font-mono text-[10px] text-amber-300">
                                  {formatSubmitTimeSeconds(sub.submitTime)}
                                </span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Non-responding players indicator when resolved */}
              {resolved && (
                <div className="pt-1 flex flex-wrap items-center justify-center gap-1.5">
                  {effectiveParticipants
                    .filter((pid) => {
                      const sub = playerAnswers[pid];
                      return !sub || sub.answer === null || sub.answerStatus === 'NO_RESPONSE';
                    })
                    .map((pid) => {
                      const p = players.find((x) => x.id === pid);
                      if (!p) return null;
                      return (
                        <span
                          key={pid}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-700 bg-stone-950/90 px-2.5 py-1 text-[11px] text-stone-400"
                        >
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: p.color }}
                          />
                          <span className="font-semibold text-stone-300">{p.username}:</span>
                          <span className="italic text-stone-400">Fără răspuns</span>
                        </span>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* ============================================================
              TYPE 2: NUMERIC ESTIMATION
              - Before resolution: physical input + on-screen keypad
              - After resolution: horizontal player cards matching Screenshot_2026-11-09_005401_7b10899b.png
                with player's number, username, color accent, ±diff, and server time (04,53s)!
          ============================================================ */}
          {question.type === 'estimation' && (
            <div className="space-y-3">
              {!resolved && (
                <form onSubmit={handleEstimationSubmit} className="flex flex-col items-center">
                  <div className="relative w-full max-w-xs sm:max-w-sm">
                    <input
                      ref={inputRef}
                      data-testid="estimation-input"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={isLocked}
                      value={estimationInput}
                      onKeyDown={(e) => {
                        if (
                          [
                            'Backspace',
                            'Delete',
                            'Tab',
                            'Escape',
                            'Enter',
                            'ArrowLeft',
                            'ArrowRight',
                            'Home',
                            'End',
                          ].includes(e.key) ||
                          e.ctrlKey ||
                          e.metaKey
                        )
                          return;
                        if (/^[0-9]$/.test(e.key)) {
                          if (estimationInput.length >= 16) e.preventDefault();
                          return;
                        }
                        if (
                          e.key === '-' &&
                          (e.currentTarget.selectionStart ?? 0) === 0 &&
                          !estimationInput.includes('-')
                        )
                          return;
                        if ((e.key === '.' || e.key === ',') && !/[.,]/.test(estimationInput))
                          return;
                        e.preventDefault();
                      }}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '.');
                        if (/^-?\d*(?:\.\d*)?$/.test(raw) && raw.length <= 16)
                          setEstimationInput(raw);
                      }}
                      placeholder="Tastează numărul..."
                      className="w-full rounded-xl sm:rounded-2xl border-2 border-amber-500/50 bg-stone-950 px-3 py-2 sm:px-4 sm:py-2.5 text-center font-mono text-xl sm:text-2xl font-black text-amber-300 placeholder-stone-600 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-60"
                    />
                    {question.unit && (
                      <span className="absolute right-3 top-2.5 sm:top-3.5 text-xs font-mono font-bold text-stone-400">
                        {question.unit}
                      </span>
                    )}
                  </div>

                  {/* On-Screen Virtual Keypad */}
                  {!isLocked && isParticipant && (
                    <div className="mt-2.5 w-full max-w-xs space-y-1.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                          <button
                            key={digit}
                            type="button"
                            onClick={() => handleKeypadPress(digit)}
                            className="flex h-9 sm:h-10 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/90 font-mono text-base sm:text-lg font-bold text-stone-100 hover:bg-stone-700 hover:border-amber-500/50 active:scale-95 transition shadow"
                          >
                            {digit}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isLocked)
                              setEstimationInput((prev) =>
                                prev.startsWith('-') ? prev.slice(1) : `-${prev}`
                              );
                          }}
                          className="flex h-9 sm:h-10 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/80 font-mono text-base sm:text-lg font-bold text-stone-100"
                        >
                          ±
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('0')}
                          className="flex h-9 sm:h-10 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/90 font-mono text-base sm:text-lg font-bold text-stone-100"
                        >
                          0
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKeypadPress('.')}
                          className="flex h-9 sm:h-10 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/90 font-mono text-base sm:text-lg font-bold text-stone-100"
                        >
                          .
                        </button>
                        <button
                          type="button"
                          onClick={handleBackspace}
                          title="Șterge ultimul caracter"
                          className="flex h-9 sm:h-10 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/80 font-mono text-sm font-bold text-amber-300"
                        >
                          <Delete className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={handleClear}
                          title="Șterge tot"
                          className="flex h-10 items-center justify-center rounded-xl border border-stone-700 bg-stone-800/80 px-2 text-xs font-bold text-red-300 hover:bg-stone-700 transition"
                        >
                          Resetează
                        </button>

                        <button
                          type="button"
                          data-testid="estimation-submit"
                          disabled={!estimationInput.trim() || isLocked}
                          onClick={() => handleEstimationSubmit()}
                          className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 px-3 font-serif text-xs sm:text-sm font-bold uppercase tracking-wider text-stone-950 shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 transition cursor-pointer"
                        >
                          <Send className="h-3.5 w-3.5 shrink-0" />
                          <span>Trimite</span>
                        </button>
                      </div>
                    </div>
                  )}
                </form>
              )}

              {/* RESOLVED NUMERIC CARDS (Matches Screenshot_2026-11-09_005401_7b10899b.png) */}
              {resolved && (
                <div data-testid="numeric-resolved-results" className="pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-end">
                    {effectiveParticipants
                      .map((pid) => {
                        const player = players.find((p) => p.id === pid);
                        const sub = playerAnswers[pid];
                        const hasAns =
                          sub &&
                          sub.answer !== null &&
                          sub.answer !== undefined &&
                          sub.answerStatus !== 'NO_RESPONSE';
                        const diff = hasAns
                          ? Math.abs(Number(sub.answer) - (question.targetNumber || 0))
                          : Number.POSITIVE_INFINITY;
                        const isWinner = Boolean(winnerIds?.includes(pid) || sub?.isCorrect);
                        return {
                          pid,
                          player,
                          sub,
                          hasAns,
                          diff,
                          isWinner,
                          submitTime: sub?.submitTime ?? Number.POSITIVE_INFINITY,
                        };
                      })
                      .sort((a, b) => {
                        if (a.isWinner !== b.isWinner) return a.isWinner ? -1 : 1;
                        if (a.diff !== b.diff) return a.diff - b.diff;
                        return a.submitTime - b.submitTime;
                      })
                      .map((item) => {
                        if (!item.player) return null;
                        const pColor = item.player.color || '#f59e0b';
                        return (
                          <div
                            key={item.pid}
                            data-testid={`numeric-result-card-${item.pid}`}
                            className={`relative overflow-hidden rounded-xl border-2 transition-all ${
                              item.isWinner
                                ? 'border-amber-300 ring-2 ring-amber-400/80 shadow-[0_0_28px_rgba(251,191,36,0.35)] sm:-translate-y-1.5'
                                : 'border-stone-700/80 shadow-lg'
                            }`}
                            style={{
                              backgroundColor: '#24130c',
                            }}
                          >
                            {/* Top Value Box with Player Color Gradient (like Screenshot 1) */}
                            <div
                              className="px-3 py-2.5 text-center border-b border-black/40"
                              style={{
                                background: `linear-gradient(180deg, ${pColor}cc 0%, #2a160ecc 90%)`,
                              }}
                            >
                              {item.isWinner && (
                                <div className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-amber-400/20 border border-amber-300/60 px-2 py-0.2 text-[9px] font-mono font-black uppercase tracking-wider text-amber-200">
                                  👑 Cel mai aproape
                                </div>
                              )}
                              <div className="font-serif text-xl sm:text-2xl font-black text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.85)] tabular-nums">
                                {item.hasAns ? item.sub.answer : 'Fără răspuns'}
                              </div>
                              {item.hasAns && Number.isFinite(item.diff) && (
                                <div className="text-[10px] font-mono font-semibold text-amber-200/90">
                                  Abatere: &plusmn;{item.diff}
                                </div>
                              )}
                            </div>

                            {/* Bottom Bar: Player Name on Left + Clock & Time on Right */}
                            <div className="flex items-center justify-between gap-2 bg-[#1c0e08] px-3 py-1.5 text-xs">
                              <span
                                className="font-bold truncate"
                                style={{ color: item.player.color }}
                              >
                                {item.player.username}
                              </span>
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-stone-400 shrink-0 tabular-nums">
                                <Clock className="h-3 w-3 text-stone-500" />
                                {item.hasAns
                                  ? formatSubmitTimeSeconds(item.sub.submitTime)
                                  : '--,--s'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Simultaneous War Duel Outcomes Summary when Resolved */}
          {resolved && phaseContext === 'war' && activeWarBattles.length > 0 && (
            <div className="mt-4 space-y-1.5 rounded-2xl border border-amber-500/30 bg-stone-950/85 p-3">
              <div className="text-[11px] font-serif font-bold uppercase tracking-wider text-amber-300">
                Rezultatul Duelurilor din Această Rundă
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {activeWarBattles.map((b) => {
                  const atk = players.find((p) => p.id === b.attackerId);
                  const def = players.find((p) => p.id === b.defenderId);
                  let statusLabel = 'În desfășurare';
                  let statusColor = 'text-stone-300';
                  if (b.outcome === 'attacker_won') {
                    statusLabel = `⚔️ ${atk?.username} a cucerit ținta (+400 pct)!`;
                    statusColor = 'text-emerald-300';
                  } else if (b.outcome === 'defender_won') {
                    statusLabel = `🛡️ ${def?.username} a apărat ținta (+100 pct)!`;
                    statusColor = 'text-sky-300';
                  } else if (b.outcome === 'needs_tiebreak') {
                    statusLabel = '🎯 Egalitate! Urmează departajarea numerică!';
                    statusColor = 'text-amber-300';
                  } else if (b.outcome === 'draw_no_bonus') {
                    statusLabel = `⚖️ Remiză — ${def?.username} păstrează teritoriul`;
                    statusColor = 'text-stone-400';
                  }

                  return (
                    <div
                      key={b.battleId}
                      className="rounded-xl border border-stone-800 bg-stone-900/90 px-2.5 py-1.5 text-xs"
                    >
                      <div className="font-bold text-stone-200">
                        {atk?.username} <span className="text-amber-400">vs</span> {def?.username}
                      </div>
                      <div className={`text-[11px] font-semibold ${statusColor}`}>
                        {statusLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Explanation if question resolved */}
          {resolved && question.explanation && (
            <div className="mt-3 rounded-2xl border border-stone-800 bg-stone-950/70 p-3 text-xs text-stone-300 text-left flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-stone-200">Știai că? </span>
                {question.explanation}
              </div>
            </div>
          )}

          {/* Error message if rejected */}
          {submitError && !resolved && (
            <div className="mt-3 flex items-center justify-center gap-1.5 text-xs font-bold text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Observer notice */}
          {!isParticipant && !resolved && (
            <div className="mt-3 text-center text-xs text-stone-400 italic">
              Ești observator la această întrebare (nu ești implicat în duelul curent).
            </div>
          )}

          {/* Locked / Registered status */}
          {(submitStatus === 'submitting' || submitStatus === 'accepted' || hasServerRecord) &&
            !resolved && (
              <div
                data-testid="answer-locked-banner"
                className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-stone-950/80 px-3 py-2 text-xs font-bold text-amber-300"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
                <span>
                  {submitStatus === 'submitting'
                    ? 'Se trimite răspunsul...'
                    : 'Răspuns înregistrat! Se așteaptă ceilalți jucători...'}
                </span>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
