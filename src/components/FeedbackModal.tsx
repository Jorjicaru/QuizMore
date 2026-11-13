import React, { useState, useEffect } from 'react';
import { FeedbackCategory } from '../types/game';
import { api } from '../services/api';
import { sound } from '../services/audio';
import { MessageSquarePlus, X, CheckCircle2, AlertTriangle, Send } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRoomId?: string | null;
}

const FEEDBACK_CATEGORIES: Array<{ id: FeedbackCategory; label: string; desc: string }> = [
  {
    id: 'problema_tehnica',
    label: 'Problemă tehnică',
    desc: 'Erori, blocaje, afișare pe telefon sau conexiune',
  },
  {
    id: 'intrebare_gresita',
    label: 'Întrebare greșită',
    desc: 'Formulări neclare, răspuns incorect sau categorie greșită',
  },
  {
    id: 'idee_imbunatatire',
    label: 'Idee de îmbunătățire',
    desc: 'Sugestii pentru moduri de joc, hartă sau interfață',
  },
  {
    id: 'altceva',
    label: 'Altceva',
    desc: 'Orice alt mesaj pentru echipa de administrare',
  },
];

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  defaultRoomId,
}) => {
  const [category, setCategory] = useState<FeedbackCategory>('problema_tehnica');
  const [message, setMessage] = useState('');
  const [roomId, setRoomId] = useState(defaultRoomId || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setRoomId(defaultRoomId || '');
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, defaultRoomId]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || typeof document === 'undefined') return;
    const scrollY = window.scrollY;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const trimmed = message.trim();
    if (trimmed.length < 5) {
      setErrorMsg('Te rugăm să scrii un mesaj de cel puțin 5 caractere.');
      return;
    }
    if (trimmed.length > 1000) {
      setErrorMsg('Mesajul nu poate depăși 1000 de caractere.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      const res = await api.submitFeedback({
        category,
        message: trimmed,
        roomId: roomId.trim() ? roomId.trim().toUpperCase() : null,
      });
      sound.playCorrect();
      setSuccessMsg(res.message || 'Feedback-ul a fost trimis cu succes!');
      setMessage('');
    } catch (err: any) {
      sound.playWrong();
      setErrorMsg(err.message || 'Nu s-a putut trimite feedback-ul.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="feedback-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2.5 sm:p-4 backdrop-blur-sm animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-lg max-h-[calc(100dvh-1.25rem)] sm:max-h-[88dvh] rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl text-left overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 sm:px-5 py-3 shrink-0">
          <div className="min-w-0 pr-2">
            <h3
              id="feedback-modal-title"
              className="font-serif text-base sm:text-xl font-bold text-slate-100 flex items-center gap-2 truncate"
            >
              <MessageSquarePlus className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 shrink-0" />
              <span>Trimite Feedback</span>
            </h3>
            <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 truncate">
              Ajută-ne să îmbunătățim CONQUIZ raportând probleme sau idei.
            </p>
          </div>
          <button
            type="button"
            data-testid="close-feedback-modal-btn"
            aria-label="Închide formularul de feedback"
            onClick={onClose}
            className="rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-slate-400 hover:text-white shrink-0 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-3.5 space-y-3.5 text-xs">
            {errorMsg && (
              <div
                data-testid="feedback-error-banner"
                className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-300 font-semibold"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg ? (
              <div
                data-testid="feedback-success-banner"
                className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-5 text-center space-y-2"
              >
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-emerald-300">{successMsg}</div>
                <p className="text-xs text-slate-300">
                  Mesajul tău a fost înregistrat în panoul de administrare cu statusul „Nou”.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="font-bold text-slate-300 block mb-1.5">
                    Categoria mesajului:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {FEEDBACK_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        data-testid={`feedback-cat-${cat.id}`}
                        onClick={() => setCategory(cat.id)}
                        className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                          category === cat.id
                            ? 'border-amber-500 bg-amber-500/15 text-amber-200 shadow-sm'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="font-bold text-xs">{cat.label}</div>
                        <div className="text-[10px] opacity-80 mt-0.5 leading-snug">
                          {cat.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="feedback-message-input"
                      className="font-bold text-slate-300"
                    >
                      Mesajul tău:
                    </label>
                    <span className="font-mono text-[10px] text-slate-400">
                      {message.length}/1000
                    </span>
                  </div>
                  <textarea
                    id="feedback-message-input"
                    data-testid="feedback-message-input"
                    rows={4}
                    maxLength={1000}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Descrie pe scurt problema întâlnită, întrebarea vizată sau ideea ta..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="feedback-room-input"
                    className="font-bold text-slate-300 block mb-1"
                  >
                    Codul Camerei (opțional):
                  </label>
                  <input
                    id="feedback-room-input"
                    data-testid="feedback-room-input"
                    type="text"
                    maxLength={16}
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    placeholder="ex: AB12CD"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-mono uppercase text-amber-300 placeholder-slate-600 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* Sticky Footer */}
          <div className="flex items-center justify-end gap-2.5 border-t border-slate-800 bg-slate-950/90 px-4 sm:px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              {successMsg ? 'Închide' : 'Anulează'}
            </button>
            {!successMsg && (
              <button
                type="submit"
                data-testid="submit-feedback-btn"
                disabled={submitting || message.trim().length < 5}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-40 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{submitting ? 'Se trimite...' : 'Trimite Feedback'}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
