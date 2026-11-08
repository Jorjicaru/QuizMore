import { Router, Request, Response } from 'express';
import { db } from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../auth';
import { Question } from '../../src/types/game';
import { gameManager } from '../gameEngine';

const router = Router();

const ALLOWED_CATEGORIES = new Set([
  'istorie', 'geografie', 'biologie', 'fizica', 'chimie', 'matematica', 'literatura',
  'arta', 'sport', 'muzica', 'cinematografie', 'cultura_generala', 'tehnologie', 'informatica',
]);
const ALLOWED_DIFFICULTIES = new Set(['usor', 'mediu', 'greu']);

function validateQuestionPayload(value: any): string | null {
  if (!value || typeof value !== 'object') return 'Formatul întrebării este invalid.';
  if (typeof value.question !== 'string' || value.question.trim().length < 8 || value.question.length > 500) return 'Textul întrebării trebuie să aibă între 8 și 500 de caractere.';
  if (!ALLOWED_CATEGORIES.has(value.category)) return 'Categoria întrebării nu este validă.';
  if (!ALLOWED_DIFFICULTIES.has(value.difficulty)) return 'Dificultatea întrebării nu este validă.';
  if (value.explanation !== undefined && (typeof value.explanation !== 'string' || value.explanation.length > 1000)) return 'Explicația nu poate depăși 1000 de caractere.';
  if (value.sourceUrl !== undefined && (typeof value.sourceUrl !== 'string' || value.sourceUrl.length > 500 || !/^https:\/\//i.test(value.sourceUrl))) return 'Sursa trebuie să fie un URL HTTPS valid de maximum 500 de caractere.';
  if (value.type === 'choice') {
    if (!Array.isArray(value.options) || value.options.length !== 4 || value.options.some((option: any) => typeof option !== 'string' || !option.trim() || option.length > 250)) return 'O întrebare grilă trebuie să aibă exact patru variante text valide.';
    if (new Set(value.options.map((option: string) => option.trim().toLowerCase())).size !== 4) return 'Variantele de răspuns trebuie să fie distincte.';
    if (!Number.isInteger(value.correctAnswerIndex) || value.correctAnswerIndex < 0 || value.correctAnswerIndex > 3) return 'Indexul răspunsului corect trebuie să fie între 0 și 3.';
  } else if (value.type === 'estimation') {
    if (typeof value.targetNumber !== 'number' || !Number.isFinite(value.targetNumber) || Math.abs(value.targetNumber) > 1e15) return 'Întrebarea numerică trebuie să aibă o valoare numerică finită.';
    if (value.unit !== undefined && (typeof value.unit !== 'string' || value.unit.length > 30)) return 'Unitatea de măsură este invalidă.';
  } else return 'Tipul întrebării trebuie să fie choice sau estimation.';
  return null;
}

function isDuplicateQuestion(candidate: any, ignoreId?: string): boolean {
  const normalized = String(candidate.question).trim().toLocaleLowerCase('ro');
  return db.getAllQuestions().some(existing =>
    (existing.id === candidate.id && existing.id !== ignoreId) || (existing.id !== ignoreId && existing.type === candidate.type && existing.category === candidate.category && existing.question.trim().toLocaleLowerCase('ro') === normalized)
  );
}

// GET questions list with optional filtering
router.get('/', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { category, difficulty, type, search } = req.query;
  let questions = db.getAllQuestions();

  if (category) {
    questions = questions.filter(q => q.category === category);
  }
  if (difficulty) {
    questions = questions.filter(q => q.difficulty === difficulty);
  }
  if (type) {
    questions = questions.filter(q => q.type === type);
  }
  if (search) {
    const term = String(search).toLowerCase();
    questions = questions.filter(q =>
      q.question.toLowerCase().includes(term) ||
      (q.explanation && q.explanation.toLowerCase().includes(term))
    );
  }

  res.json({ questions, total: questions.length });
});

// GET questions breakdown
router.get('/stats', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const all = db.getAllQuestions();
  const byCategory: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const byType: Record<string, number> = {};

  for (const q of all) {
    byCategory[q.category] = (byCategory[q.category] || 0) + 1;
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
    byType[q.type] = (byType[q.type] || 0) + 1;
  }

  res.json({
    total: all.length,
    byCategory,
    byDifficulty,
    byType,
  });
});

// Admin: Add new question
router.post('/', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { type, category, difficulty, question, options, correctAnswerIndex, targetNumber, unit, explanation, sourceUrl } = req.body;

  const validationError = validateQuestionPayload({ type, category, difficulty, question, options, correctAnswerIndex, targetNumber, unit, explanation, sourceUrl });
  if (validationError) { res.status(400).json({ error: validationError }); return; }
  if (isDuplicateQuestion({ type, category, question })) { res.status(409).json({ error: 'Există deja o întrebare identică în aceeași categorie.' }); return; }

  const id = `q_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newQ: Question = {
    id,
    type,
    category,
    difficulty,
    question,
    options: type === 'choice' ? options : undefined,
    correctAnswerIndex: type === 'choice' ? Number(correctAnswerIndex) : undefined,
    targetNumber: type === 'estimation' ? Number(targetNumber) : undefined,
    unit: type === 'estimation' ? unit : undefined,
    explanation,
    sourceUrl,
  };

  db.addQuestion(newQ);
  gameManager.reloadQuestions();
  res.json({ success: true, question: newQ });
});

// Admin: Edit question
router.put('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { id } = req.params;
  const patch = req.body;
  const existing = db.getAllQuestions().find(q => q.id === id);
  if (!existing) { res.status(404).json({ error: 'Întrebarea nu a fost găsită.' }); return; }
  const merged = { ...existing, ...patch };
  const validationError = validateQuestionPayload(merged);
  if (validationError) { res.status(400).json({ error: validationError }); return; }
  const allowedFields = ['type', 'category', 'difficulty', 'question', 'options', 'correctAnswerIndex', 'targetNumber', 'unit', 'explanation', 'sourceUrl'];
  const safePatch = Object.fromEntries(Object.entries(patch || {}).filter(([key]) => allowedFields.includes(key)));
  if (isDuplicateQuestion(merged, id)) { res.status(409).json({ error: 'Există deja o întrebare identică în aceeași categorie.' }); return; }
  const updated = db.updateQuestion(id, safePatch);
  if (!updated) {
    res.status(404).json({ error: 'Întrebarea nu a fost găsită.' });
    return;
  }
  gameManager.reloadQuestions();
  res.json({ success: true, question: updated });
});

// Admin: Delete question
router.delete('/:id', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { id } = req.params;
  const ok = db.deleteQuestion(id);
  if (!ok) {
    res.status(404).json({ error: 'Întrebarea nu a fost găsită.' });
    return;
  }
  gameManager.reloadQuestions();
  res.json({ success: true, message: 'Întrebare ștearsă.' });
});

// Admin: Import questions from JSON array
router.post('/import', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0 || questions.length > 1000) {
    res.status(400).json({ error: 'Trimiteți un array cu 1–1000 de întrebări.' });
    return;
  }

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (let index = 0; index < questions.length; index++) {
    const raw = questions[index];
    const candidate = {
      id: typeof raw?.id === 'string' && raw.id.length <= 100 ? raw.id : `q_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`,
      type: raw?.type,
      category: raw?.category,
      difficulty: raw?.difficulty || 'mediu',
      question: raw?.question,
      options: raw?.options,
      correctAnswerIndex: raw?.correctAnswerIndex,
      targetNumber: raw?.targetNumber,
      unit: raw?.unit,
      explanation: typeof raw?.explanation === 'string' ? raw.explanation.slice(0, 1000) : undefined,
      sourceUrl: raw?.sourceUrl,
    };
    const validationError = validateQuestionPayload(candidate);
    if (validationError) { skipped++; if (errors.length < 10) errors.push(`Rândul ${index + 1}: ${validationError}`); continue; }
    if (isDuplicateQuestion(candidate)) { skipped++; continue; }
    db.addQuestion(candidate as Question);
    imported++;
  }
  if (imported > 0) gameManager.reloadQuestions();
  res.json({ success: true, imported, skipped, errors, message: `Importate ${imported} întrebări; ${skipped} ignorate (invalide sau duplicate).` });
});

export default router;
