import React, { useState, useEffect, useRef } from 'react';
import { ActiveQuestionState, Player, Territory, WarRoundState } from '../types/game';
import { formatWarAttackAnnouncement, applyNumericKeypadInput } from '../game/rules';
import { sound } from '../services/audio';
import { socketService } from '../services/socket';
import {
  Clock,
  HelpCircle,
  CheckCircle2,
  XCircle,
  Swords,
  Shield,
  Trophy,
  AlertCircle,
} from 'lucide-react';

interface QuestionModalProps {
  activeQuestion: ActiveQuestionState;
  players: Player[];
  territories?: Record<string, Territory>;
  currentUserId?: string;
  warRound?: WarRoundState | null;
  onSubmitAnswer: (
    answer: number | string,
    cb?: (res: {
      success: boolean;
      message?: string;
      acceptedAnswer?: number;
      code?: string;
      timedOut?: boolean;
    }) => void,
    questionInstanceId?: string
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
  territories,
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
    targetTerritoryId,
    phaseContext,
    participantIds,
    winnerIds,
    playerAnswers,
    resolved,
  } = activeQuestion;

  const instanceKey = questionInstanceId || `${question.id}_${startTime}`;

  const [timeLeft, setTimeLeft] = useState<number>(durationSeconds);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [numericInput, setNumericInput] = useState<string>('');
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Smooth RAF countdown timer DOM ref
  const progressBarRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const prevTickSecRef = useRef<number>(-1);
  const lastColorBucketRef = useRef<string>('');

  // Immediate synchronous lock to prevent double-click before state re-renders
  const submittingLockRef = useRef<boolean>(false);
  const activeInstanceKeyRef = useRef<string>(instanceKey);

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
    setSelectedOption(null);
    setNumericInput('');
  }, [instanceKey]);

  // Sync with server state if server already recorded our answer
  useEffect(() => {
    if (hasServerRecord && submitStatus !== 'accepted' && !resolved) {
      submittingLockRef.current = true;
      setSubmitStatus('accepted');
    }
  }, [hasServerRecord, submitStatus, resolved]);

  const allowDecimals =
    question.unit === 'zecimal' ||
    (question.targetNumber !== undefined &&
      question.targetNumber !== null &&
      !Number.isInteger(question.targetNumber));

  // Optional physical keyboard support on desktop without focusing an editable input
  useEffect(() => {
    if (question.type !== 'estimation' || resolved || isLocked || !isParticipant) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (/^[0-9]$/.test(ev.key)) {
        ev.preventDefault();
        sound.playClick();
        setSubmitError(null);
        setNumericInput((prev) => applyNumericKeypadInput(prev, ev.key, allowDecimals));
      } else if (ev.key === 'Backspace') {
        ev.preventDefault();
        sound.playClick();
        setNumericInput((prev) => applyNumericKeypadInput(prev, '⌫', allowDecimals));
      } else if (ev.key === 'Delete' || ev.key === 'Escape') {
        ev.preventDefault();
        sound.playClick();
        setNumericInput((prev) => applyNumericKeypadInput(prev, 'C', allowDecimals));
      } else if (ev.key === '-') {
        ev.preventDefault();
        sound.playClick();
        setNumericInput((prev) => applyNumericKeypadInput(prev, '±', allowDecimals));
      } else if (allowDecimals && (ev.key === '.' || ev.key === ',')) {
        ev.preventDefault();
        sound.playClick();
        setNumericInput((prev) => applyNumericKeypadInput(prev, '.', allowDecimals));
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        handleSubmitNumeric();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // Smooth RAF countdown timer effect with direct DOM transform scaleX (zero re-render overhead)
  useEffect(() => {
    const totalMs = durationSeconds * 1000;
    const deadline = startTime + totalMs;
    lastColorBucketRef.current = '';

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
      const now = socketService.getEstimatedServerNow();
      const remainingMs = Math.max(0, deadline - now);
      const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));

      if (progressBarRef.current) {
        progressBarRef.current.style.transform = `scaleX(${ratio})`;
        const remSec = Math.ceil(remainingMs / 1000);
        const nextBucket = remSec <= 3 ? '#ef4444' : remSec <= 7 ? '#f59e0b' : '#10b981';
        if (nextBucket !== lastColorBucketRef.current) {
          lastColorBucketRef.current = nextBucket;
          progressBarRef.current.style.backgroundColor = nextBucket;
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
      if (!document.hidden && deadline > socketService.getEstimatedServerNow() && !resolved) {
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
      } else if (question.type === 'estimation') {
        if (winnerIds?.includes(currentUserId)) {
          sound.playConquer();
        } else {
          sound.playWrong();
        }
      } else if (Number(mySub.answer) === question.correctAnswerIndex) {
        if (winnerIds?.includes(currentUserId)) {
          sound.playConquer();
        } else {
          sound.playCorrect();
        }
      } else {
        sound.playWrong();
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

    onSubmitAnswer(
      index,
      (res) => {
        if (activeInstanceKeyRef.current !== currentKey) return;
        if (!res || res.timedOut || res.code === 'ACK_TIMEOUT') {
          setSubmitStatus('submitting');
          return;
        }
        if (res.success || res.code === 'DUPLICATE' || res.message?.includes('deja')) {
          setSubmitStatus('accepted');
          setSubmitError(null);
        } else if (
          res.code === 'EXPIRED' ||
          res.code === 'STALE_INSTANCE' ||
          res.message?.includes('expirat')
        ) {
          setSubmitStatus('expired');
          setSubmitError(res.message || 'Timpul a expirat.');
        } else {
          submittingLockRef.current = false;
          setSubmitStatus('rejected');
          setSelectedOption(null);
          setSubmitError(res.message || 'Răspuns respins de server.');
        }
      },
      currentKey
    );
  };

  const handleSubmitNumeric = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submittingLockRef.current || isLocked) return;
    const cleaned = numericInput.trim().replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(cleaned) || !Number.isFinite(Number(cleaned))) {
      sound.playWrong();
      setSubmitError('Introdu un număr valid pentru departajare.');
      return;
    }

    submittingLockRef.current = true;
    const currentKey = instanceKey;
    sound.playClick();
    setSubmitStatus('submitting');
    setSubmitError(null);

    onSubmitAnswer(
      Number(cleaned),
      (res) => {
        if (activeInstanceKeyRef.current !== currentKey) return;
        if (!res || res.timedOut || res.code === 'ACK_TIMEOUT') {
          setSubmitStatus('submitting');
          return;
        }
        if (res.success || res.code === 'DUPLICATE' || res.message?.includes('deja')) {
          setSubmitStatus('accepted');
          setSubmitError(null);
        } else if (
          res.code === 'EXPIRED' ||
          res.code === 'STALE_INSTANCE' ||
          res.message?.includes('expirat')
        ) {
          setSubmitStatus('expired');
          setSubmitError(res.message || 'Timpul a expirat.');
        } else {
          submittingLockRef.current = false;
          setSubmitStatus('rejected');
          setSubmitError(res.message || 'Răspuns respins de server.');
        }
      },
      currentKey
    );
  };

  const isRegenQuestion = activeQuestion.warActionType === 'regenerate_tower';

  const phaseBadgeLabel =
    phaseContext === 'conquest'
      ? 'Cucerire (+200 pct)'
      : phaseContext === 'allocation'
      ? 'Departajare (+300 pct)'
      : isRegenQuestion
      ? '🏰 Regenerare Turn (+1 Turn)'
      : activeQuestion.isTiebreak
      ? '⚔️ Departajare Numerică (+400 pct)'
      : 'Atac (+400 pct)';

  // Count how many participants have answered so far
  const answeredCount = effectiveParticipants.filter((pid) => {
    const sub = playerAnswers[pid];
    if (!sub) return false;
    if (!resolved) return true;
    return sub.answer !== null && sub.answerStatus !== 'NO_RESPONSE';
  }).length;

  // Individual war duel details (1 attacker, 1 defender, 1 target territory)
  const activeWarBattle =
    phaseContext === 'war' && warRound?.battles
      ? warRound.battles.find((b) => b.targetTerritoryId !== null) || warRound.battles[0] || null
      : null;

  const warAttacker =
    phaseContext === 'war'
      ? players.find((p) => p.id === (activeWarBattle?.attackerId || attackerId))
      : undefined;
  const warDefender =
    phaseContext === 'war'
      ? players.find((p) => p.id === (activeWarBattle?.defenderId || defenderId))
      : undefined;
  const warTargetId = activeWarBattle?.targetTerritoryId || targetTerritoryId;
  const warTargetTerritory = warTargetId && territories ? territories[warTargetId] : undefined;

  const warAttackAnnouncement =
    phaseContext === 'war' && !isRegenQuestion && warAttacker && warDefender
      ? formatWarAttackAnnouncement({
          attacker: warAttacker,
          defender: warDefender,
          targetTerritory: warTargetTerritory || null,
          lastBattleResult: warRound?.lastBattleResult || null,
        })
      : null;

  // Determine personal outcome banner when resolved
  const renderPersonalOutcomeBanner = () => {
    if (!resolved || !currentUserId || !isParticipant) return null;
    const mySub = playerAnswers[currentUserId];
    const isNoResponse = !mySub || mySub.answer === null || mySub.answerStatus === 'NO_RESPONSE';
    const isWinner = Boolean(winnerIds?.includes(currentUserId));
    const isCorr =
      !isNoResponse &&
      (question.type === 'estimation'
        ? isWinner
        : Number(mySub.answer) === question.correctAnswerIndex);

    if (isNoResponse) {
      return (
        <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-stone-600 bg-stone-900/90 px-3 py-1.5 text-xs sm:text-sm font-bold text-stone-300">
          <Clock className="h-4 w-4 text-amber-400 shrink-0" />
          <span>TIMP EXPIRAT — Nu ai trimis niciun răspuns la această întrebare.</span>
        </div>
      );
    }

    if (question.type === 'estimation') {
      if (isWinner) {
        return (
          <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-emerald-400 bg-emerald-950/90 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-200 shadow-lg">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              AI CÂȘTIGAT DEPARTAJAREA NUMERICĂ! Estimarea ta a fost cea mai apropiată!
            </span>
          </div>
        );
      }
      return (
        <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-red-500/70 bg-red-950/90 px-3 py-1.5 text-xs sm:text-sm font-bold text-red-200">
          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>Adversarul a fost mai aproape de valoarea exactă în departajare.</span>
        </div>
      );
    }

    if (phaseContext === 'allocation') {
      if (isWinner) {
        return (
          <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-amber-400 bg-amber-950/90 px-3 py-1.5 text-xs sm:text-sm font-bold text-amber-200 shadow-lg">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
            <span>
              RĂSPUNS CORECT ȘI CEL MAI RAPID! Urmează să alegi un teritoriu liber (+300 PCT)!
            </span>
          </div>
        );
      }
      if (isCorr) {
        return (
          <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-emerald-500/60 bg-emerald-950/80 px-3 py-1.5 text-xs sm:text-sm font-semibold text-emerald-200">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>Răspuns corect, dar alt jucător eligibil a răspuns mai rapid.</span>
          </div>
        );
      }
      return (
        <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-red-500/70 bg-red-950/90 px-3 py-1.5 text-xs sm:text-sm font-bold text-red-200">
          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>RĂSPUNS GREȘIT! Alt jucător primește dreptul de alegere în departajare.</span>
        </div>
      );
    }

    if (isCorr) {
      return (
        <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-emerald-400/80 bg-emerald-950/90 px-3 py-1.5 text-xs sm:text-sm font-bold text-emerald-200 shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>
            {phaseContext === 'conquest'
              ? targetTerritoryId
                ? 'RĂSPUNS CORECT! Ai cucerit teritoriul selectat (+200 PCT)!'
                : 'RĂSPUNS CORECT! Ai câștigat dreptul de a alege un teritoriu (+200 PCT)!'
              : isRegenQuestion
              ? 'RĂSPUNS CORECT! Ai regenerat 1 turn în cetatea ta de bază!'
              : activeQuestion.isTiebreak && isWinner
              ? 'AI CÂȘTIGAT DEPARTAJAREA!'
              : 'RĂSPUNS CORECT!'}
          </span>
        </div>
      );
    }

    return (
      <div className="mb-2.5 flex items-center justify-center gap-2 rounded-xl border border-red-500/70 bg-red-950/90 px-3 py-1.5 text-xs sm:text-sm font-bold text-red-200">
        <XCircle className="h-4 w-4 text-red-400 shrink-0" />
        <span>
          {phaseContext === 'conquest'
            ? targetTerritoryId
              ? 'RĂSPUNS GREȘIT! Teritoriul selectat rămâne neutru.'
              : 'RĂSPUNS GREȘIT! Nu primești teritoriu în această rundă.'
            : isRegenQuestion
            ? 'RĂSPUNS GREȘIT! Numărul de turnuri rămâne neschimbat.'
            : 'RĂSPUNS GREȘIT!'}
        </span>
      </div>
    );
  };

  const conquestPicker =
    phaseContext === 'conquest' ? players.find((p) => p.id === attackerId) : undefined;
  const conquestTargetTerritory =
    phaseContext === 'conquest' && targetTerritoryId && territories
      ? territories[targetTerritoryId]
      : undefined;

  return (
    <div
      data-testid="question-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/85 p-1.5 sm:p-4 backdrop-blur-md select-none animate-fadeIn overflow-x-hidden"
    >
      <div className="relative flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl sm:rounded-3xl border-2 border-amber-500/50 bg-[#2b1810]/98 shadow-[0_0_60px_rgba(0,0,0,0.95)] backdrop-blur-2xl">
        {/* Top Header */}
        <div className="shrink-0 border-b border-amber-900/60 bg-gradient-to-r from-[#1e100a] via-[#2d1910] to-[#1e100a] px-3 sm:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span
                data-testid="question-phase-badge"
                className="rounded-lg border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-serif text-[10px] sm:text-xs font-bold uppercase tracking-wider text-amber-300"
              >
                {phaseBadgeLabel}
              </span>
              {phaseContext !== 'war' && (
                <span className="rounded-lg border border-stone-700 bg-stone-900/80 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-stone-300">
                  {answeredCount} / {effectiveParticipants.length} răspunsuri
                </span>
              )}
            </div>

            {/* Timer Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-stone-950 px-2.5 sm:px-3 py-0.5 font-mono text-xs sm:text-sm font-bold shadow-inner shrink-0 tabular-nums">
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

          {/* Conquest Selected Target Banner */}
          {phaseContext === 'conquest' && conquestTargetTerritory && (
            <div
              data-testid="conquest-selected-target-banner"
              className="mt-2 rounded-xl border border-amber-400/60 bg-stone-950/90 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-left"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="font-serif text-xs sm:text-sm font-black text-amber-100 leading-snug">
                  {currentUserId === attackerId
                    ? `Ai ales ${conquestTargetTerritory.name}. Răspunde corect pentru a-l cuceri.`
                    : `${conquestPicker?.username || 'Jucătorul'} a ales ${conquestTargetTerritory.name}. Răspunde corect pentru a-l cuceri.`}
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-amber-200 shrink-0">
                  {currentUserId === attackerId
                    ? 'Răspunde acum!'
                    : `Răspunde ${conquestPicker?.username || 'jucătorul activ'}`}
                </span>
              </div>
            </div>
          )}

          {/* Tower Regeneration Banner */}
          {phaseContext === 'war' && isRegenQuestion && warAttacker && (
            <div
              data-testid="war-modal-regen-banner"
              className="mt-2 rounded-xl border border-emerald-400/60 bg-stone-950/90 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-left"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <p className="font-serif text-xs sm:text-sm font-black text-emerald-200 leading-snug">
                  🏰 REGENERARE TURN: {warAttacker.username} reconstruiește un turn în Cetatea{' '}
                  {warTargetTerritory?.name || 'de bază'} ({warTargetTerritory?.castleTowers ?? 2}/3)
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/50 bg-emerald-500/20 px-2 py-0.5 text-[10px] sm:text-[11px] font-bold text-emerald-200">
                  {currentUserId === warAttacker.id
                    ? 'Răspunde corect pentru +1 turn!'
                    : `Răspunde doar ${warAttacker.username}`}
                </span>
              </div>
            </div>
          )}

          {/* Individual War Attack Banner */}
          {phaseContext === 'war' && warAttackAnnouncement && warAttacker && warDefender && (
            <div
              data-testid="war-modal-attack-banner"
              className="mt-2 rounded-xl border border-amber-400/60 bg-stone-950/90 px-2.5 sm:px-3.5 py-1.5 sm:py-2 text-left"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Swords className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-400 shrink-0" />
                  <p className="font-serif text-xs sm:text-sm font-black text-amber-100 leading-snug break-words">
                    {warAttackAnnouncement.headline}
                    {warTargetTerritory?.isBase && (
                      <span className="ml-1.5 inline-flex items-center rounded bg-rose-500/25 border border-rose-400/50 px-1.5 py-0.5 font-mono text-[10px] text-rose-200">
                        🏰 {warTargetTerritory.castleTowers ?? 3}/3 turnuri
                      </span>
                    )}
                  </p>
                </div>

                <span
                  data-testid="war-modal-responder-badge"
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-bold shrink-0 ${
                    currentUserId === warAttacker.id
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : currentUserId === warDefender.id
                      ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                      : 'border-stone-700 bg-stone-900 text-stone-300'
                  }`}
                >
                  {currentUserId === warAttacker.id ? (
                    <>
                      <Swords className="h-3 w-3 text-amber-300" />
                      <span>Tu ataci — răspunde acum!</span>
                    </>
                  ) : currentUserId === warDefender.id ? (
                    <>
                      <Shield className="h-3 w-3 text-sky-300" />
                      <span>Tu te aperi — răspunde acum!</span>
                    </>
                  ) : (
                    <span>
                      Răspund doar {warAttacker.username} și {warDefender.username}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Progress Timer Line (Smooth RAF Animation) */}
          <div className="mt-2 h-1.5 sm:h-2 w-full overflow-hidden rounded-full bg-stone-950 border border-stone-800/80">
            <div
              ref={progressBarRef}
              className="h-full w-full origin-left will-change-transform bg-emerald-500"
              style={{ transform: resolved ? 'scaleX(0)' : 'scaleX(1)' }}
            />
          </div>
        </div>

        {/* Scrollable Inner Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 py-2.5 sm:py-4">
          {/* Personal Outcome Banner on Resolution */}
          {renderPersonalOutcomeBanner()}

          {/* Individual War Duel Outcome Banner when Resolved */}
          {resolved && phaseContext === 'war' && (warRound?.lastBattleResult || activeWarBattle) && (
            <div
              data-testid="war-modal-outcome-box"
              className={`mb-3 rounded-xl border-2 px-3 py-2 text-left shadow-lg ${
                warRound?.lastBattleResult?.outcome === 'attacker_won' ||
                activeWarBattle?.outcome === 'attacker_won'
                  ? 'border-emerald-400/80 bg-emerald-950/90'
                  : warRound?.lastBattleResult?.outcome === 'defender_won' ||
                    activeWarBattle?.outcome === 'defender_won' ||
                    activeWarBattle?.outcome === 'draw_no_bonus'
                  ? 'border-sky-400/80 bg-sky-950/90'
                  : 'border-amber-400/80 bg-amber-950/90'
              }`}
            >
              {warRound?.lastBattleResult ? (
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      {warRound.lastBattleResult.outcome === 'attacker_won' ? (
                        <Swords className="h-4 w-4 text-emerald-300 shrink-0" />
                      ) : (
                        <Shield className="h-4 w-4 text-sky-300 shrink-0" />
                      )}
                      <span
                        data-testid="war-modal-outcome-headline"
                        className="font-serif text-xs sm:text-sm font-black uppercase tracking-wide text-white"
                      >
                        {warRound.lastBattleResult.headline}
                      </span>
                    </div>
                    {warRound.lastBattleResult.effectBadge && (
                      <span className="rounded-full border border-white/25 bg-black/45 px-2 py-0.5 font-mono text-[10px] font-black text-amber-200">
                        {warRound.lastBattleResult.effectBadge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-stone-100">
                    {warRound.lastBattleResult.details}
                  </p>
                </div>
              ) : activeWarBattle?.outcome === 'needs_tiebreak' ? (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-bold text-amber-200">
                  <Swords className="h-4 w-4 text-amber-300 shrink-0" />
                  <span>
                    Ambii jucători au răspuns corect! Urmează întrebarea numerică de departajare!
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Question Banner */}
          <div className="mb-3 rounded-xl sm:rounded-2xl border border-amber-900/70 bg-gradient-to-b from-[#4a2618] to-[#361b10] p-3 sm:p-4 shadow-inner text-center">
            <h3 className="font-serif text-sm sm:text-xl font-bold leading-snug sm:leading-relaxed text-amber-50 break-words">
              {question.question}
            </h3>
            {question.type === 'estimation' && !resolved && (
              <p className="mt-1 text-[11px] sm:text-xs text-amber-300/90 font-semibold">
                Introdu un număr întreg — câștigă jucătorul cu estimarea cea mai apropiată!
              </p>
            )}
            {question.type === 'choice' &&
              (phaseContext === 'allocation' || activeQuestion.isTiebreak) &&
              !resolved && (
                <p className="mt-1 text-[11px] sm:text-xs text-amber-300/90 font-semibold">
                  Alege varianta corectă cât mai rapid pentru a câștiga departajarea!
                </p>
              )}
          </div>

          {/* NUMERIC ESTIMATION TIEBREAK INPUT & RESOLUTION */}
          {question.type === 'estimation' && (
            <div
              data-testid="numeric-tiebreak-panel"
              className="w-full max-w-xs sm:max-w-sm mx-auto space-y-2.5"
            >
              {!resolved ? (
                isParticipant ? (
                  <form onSubmit={handleSubmitNumeric} className="w-full space-y-2">
                    {/* Read-only display field (never opens mobile virtual keyboard) + Clear All */}
                    <div className="flex items-stretch gap-1.5 w-full">
                      <input
                        type="text"
                        readOnly
                        inputMode="none"
                        data-testid="numeric-tiebreak-input"
                        disabled={isLocked}
                        value={numericInput}
                        onFocus={(e) => e.currentTarget.blur()}
                        placeholder="0"
                        aria-label="Numărul introdus"
                        className="min-w-0 flex-1 rounded-xl border-2 border-amber-500/60 bg-stone-950 px-3 py-2 text-center font-mono text-xl sm:text-2xl font-black tracking-wider text-amber-100 placeholder-stone-600 focus:outline-none disabled:opacity-60 select-none cursor-default"
                      />
                      <button
                        type="button"
                        data-testid="numeric-tiebreak-clear"
                        disabled={isLocked || numericInput.length === 0}
                        onClick={() => {
                          if (isLocked) return;
                          sound.playClick();
                          setSubmitError(null);
                          setNumericInput((prev) =>
                            applyNumericKeypadInput(prev, 'C', allowDecimals)
                          );
                        }}
                        className="shrink-0 rounded-xl border border-red-500/40 bg-red-950/60 px-2.5 sm:px-3 py-2 font-sans text-[11px] sm:text-xs font-extrabold uppercase tracking-wide text-red-200 hover:bg-red-900/70 disabled:opacity-35 active:scale-95 transition"
                        title="Șterge tot"
                      >
                        Șterge tot
                      </button>
                    </div>

                    {/* Familiar 3x4 Dial Pad: 1 2 3 / 4 5 6 / 7 8 9 / ± 0 ⌫ */}
                    <div
                      data-testid="numeric-tiebreak-keypad"
                      className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full"
                    >
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '±', '0', '⌫'].map((key) => {
                        const isActionKey = key === '±' || key === '⌫';
                        return (
                          <button
                            key={key}
                            type="button"
                            data-testid={`numeric-keypad-key-${key}`}
                            disabled={isLocked}
                            onClick={() => {
                              if (isLocked) return;
                              sound.playClick();
                              setSubmitError(null);
                              setNumericInput((prev) =>
                                applyNumericKeypadInput(prev, key, allowDecimals)
                              );
                            }}
                            className={`h-11 sm:h-12 w-full rounded-xl border font-mono text-base sm:text-lg font-black shadow-sm transition active:scale-95 disabled:opacity-45 ${
                              key === '⌫'
                                ? 'border-red-500/45 bg-red-950/55 text-red-200 hover:bg-red-900/65'
                                : isActionKey
                                ? 'border-amber-500/35 bg-stone-900 text-amber-300 hover:bg-stone-800'
                                : 'border-stone-700 bg-stone-900/95 text-stone-100 hover:bg-stone-800'
                            }`}
                          >
                            {key}
                          </button>
                        );
                      })}
                      {allowDecimals && (
                        <button
                          type="button"
                          data-testid="numeric-keypad-key-decimal"
                          disabled={isLocked}
                          onClick={() => {
                            if (isLocked) return;
                            sound.playClick();
                            setSubmitError(null);
                            setNumericInput((prev) =>
                              applyNumericKeypadInput(prev, '.', allowDecimals)
                            );
                          }}
                          className="col-span-3 h-10 rounded-xl border border-amber-500/35 bg-stone-900 font-mono text-base font-black text-amber-300 hover:bg-stone-800 disabled:opacity-45 active:scale-95 transition"
                        >
                          .
                        </button>
                      )}
                    </div>

                    {/* Full-width Trimite button BELOW the keypad */}
                    <button
                      type="submit"
                      data-testid="numeric-tiebreak-submit"
                      disabled={
                        isLocked ||
                        numericInput.trim().length === 0 ||
                        numericInput.trim() === '-'
                      }
                      className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-serif text-sm sm:text-base font-black uppercase tracking-wider text-stone-950 shadow-lg hover:brightness-110 disabled:opacity-40 active:scale-[0.98] transition"
                    >
                      {submitStatus === 'submitting'
                        ? 'Se trimite...'
                        : submitStatus === 'accepted' || hasServerRecord
                        ? 'Răspuns trimis ✓'
                        : 'Trimite'}
                    </button>
                  </form>
                ) : null
              ) : (
                <div
                  data-testid="numeric-tiebreak-resolved"
                  className="space-y-2.5 rounded-2xl border border-amber-500/40 bg-stone-950/90 p-3 sm:p-4"
                >
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-950/70 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="font-serif text-xs sm:text-sm font-bold text-emerald-200">
                      Valoarea exactă:{' '}
                      <strong className="font-mono text-sm sm:text-base text-white">
                        {question.targetNumber}
                      </strong>
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {effectiveParticipants.map((pid) => {
                      const p = players.find((x) => x.id === pid);
                      if (!p) return null;
                      const sub = playerAnswers[pid];
                      const hasAns =
                        sub && sub.answer !== null && sub.answer !== undefined && sub.answerStatus !== 'NO_RESPONSE';
                      const isWin = Boolean(winnerIds?.includes(pid));
                      const diff =
                        hasAns && question.targetNumber !== undefined
                          ? Math.abs(Number(sub.answer) - question.targetNumber)
                          : null;

                      return (
                        <div
                          key={pid}
                          className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs ${
                            isWin
                              ? 'border-amber-400 bg-amber-500/20 text-white font-bold'
                              : 'border-stone-800 bg-stone-900/80 text-stone-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            <span>{p.username}</span>
                            {isWin && <span className="text-amber-300">👑 Câștigător</span>}
                          </div>
                          {hasAns ? (
                            <div className="flex items-center gap-2 font-mono text-[11px] sm:text-xs">
                              <span className="text-amber-200 font-bold">
                                Răspuns: {sub.answer}
                              </span>
                              {diff !== null && (
                                <span className="text-stone-300">(Δ {diff})</span>
                              )}
                              <span className="text-amber-300">
                                {formatSubmitTimeSeconds(sub.submitTime)}
                              </span>
                            </div>
                          ) : (
                            <span className="italic text-stone-400">Fără răspuns</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MULTIPLE CHOICE (4 OPTIONS) */}
          {question.type !== 'estimation' && question.options && (
            <div
              data-testid={resolved ? 'choice-resolved-options' : 'choice-options'}
              className="space-y-2 sm:space-y-2.5 max-w-xl mx-auto"
            >
              {question.options.map((option, index) => {
                const myAnswer =
                  currentUserId &&
                  playerAnswers[currentUserId]?.answer !== null &&
                  playerAnswers[currentUserId]?.answer !== undefined
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

                // Build background style from choosing players' colors when resolved
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
                    className={`relative flex w-full min-h-[48px] flex-col justify-center rounded-xl sm:rounded-2xl border-2 px-3 sm:px-4 py-2 sm:py-2.5 text-center transition-all ${frameClasses} ${
                      isLocked ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-black/40 font-mono text-xs font-bold text-amber-300">
                        {String.fromCharCode(65 + index)}
                      </span>

                      <span className="flex-1 text-center font-serif text-sm sm:text-base font-bold leading-snug break-words drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
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
                          const isFastestWinner = Boolean(winnerIds?.includes(p.id));
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
                              {isFastestWinner &&
                                (phaseContext === 'allocation' || activeQuestion.isTiebreak) && (
                                  <span className="text-[10px] text-amber-300">👑</span>
                                )}
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

          {/* Explanation if question resolved */}
          {resolved && question.explanation && (
            <div className="mt-3 rounded-2xl border border-stone-800 bg-stone-950/70 p-2.5 sm:p-3 text-xs text-stone-300 text-left flex items-start gap-2">
              <HelpCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-stone-200">Știai că? </span>
                {question.explanation}
              </div>
            </div>
          )}

          {/* Error message if rejected */}
          {submitError && !resolved && (
            <div className="mt-2.5 flex items-center justify-center gap-1.5 text-xs font-bold text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Observer notice */}
          {!isParticipant && !resolved && (
            <div className="mt-2.5 text-center text-xs text-stone-300 italic">
              {phaseContext === 'war' && isRegenQuestion && warAttacker
                ? `Ești observator — răspunde doar ${warAttacker.username} pentru regenerarea turnului.`
                : phaseContext === 'war' && warAttacker && warDefender
                ? `Ești observator la acest atac — răspund doar ${warAttacker.username} și ${warDefender.username}.`
                : 'Ești observator la această întrebare.'}
            </div>
          )}

          {/* Locked / Registered status */}
          {(submitStatus === 'submitting' || submitStatus === 'accepted' || hasServerRecord) &&
            !resolved && (
              <div
                data-testid="answer-locked-banner"
                className="mt-2.5 flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-stone-950/80 px-3 py-2 text-xs font-bold text-amber-300"
              >
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </span>
                <span>
                  {submitStatus === 'submitting'
                    ? 'Se trimite răspunsul...'
                    : 'Răspuns înregistrat! Se așteaptă rezultatul...'}
                </span>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
