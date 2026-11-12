import { Router, Response } from 'express';
import { db } from '../db';
import { authenticate, requireAdmin, AuthRequest } from '../auth';
import { Question } from '../../src/types/game';
import { gameManager } from '../gameEngine';

const router = Router();

const ALLOWED_CATEGORIES = new Set([
  'istorie',
  'geografie',
  'biologie',
  'fizica',
  'chimie',
  'matematica',
  'literatura',
  'arta',
  'sport',
  'muzica',
  'cinematografie',
  'cultura_generala',
  'tehnologie',
  'informatica',
]);
const ALLOWED_DIFFICULTIES = new Set(['usor', 'mediu', 'greu']);

function validateQuestionPayload(value: any): string | null {
  if (!value || typeof value !== 'object') return 'Formatul întrebării este invalid.';
  if (
    typeof value.question !== 'string' ||
    value.question.trim().length < 8 ||
    value.question.length > 500
  )
    return 'Textul întrebării trebuie să aibă între 8 și 500 de caractere.';
  if (!ALLOWED_CATEGORIES.has(value.category)) return 'Categoria întrebării nu este validă.';
  if (!ALLOWED_DIFFICULTIES.has(value.difficulty)) return 'Dificultatea întrebării nu este validă.';
  if (
    value.explanation !== undefined &&
    (typeof value.explanation !== 'string' || value.explanation.length > 1000)
  )
    return 'Explicația nu poate depăși 1000 de caractere.';
  if (
    value.sourceUrl !== undefined &&
    (typeof value.sourceUrl !== 'string' ||
      value.sourceUrl.length > 500 ||
      !/^https:\/\//i.test(value.sourceUrl))
  )
    return 'Sursa trebuie să fie un URL HTTPS valid de maximum 500 de caractere.';
  if (value.type === 'choice') {
    if (
      !Array.isArray(value.options) ||
      value.options.length !== 4 ||
      value.options.some(
        (option: any) => typeof option !== 'string' || !option.trim() || option.length > 250
      )
    )
      return 'O întrebare grilă trebuie să aibă exact patru variante text valide.';
    if (new Set(value.options.map((option: string) => option.trim().toLowerCase())).size !== 4)
      return 'Variantele de răspuns trebuie să fie distincte.';
    if (
      !Number.isInteger(value.correctAnswerIndex) ||
      value.correctAnswerIndex < 0 ||
      value.correctAnswerIndex > 3
    )
      return 'Indexul răspunsului corect trebuie să fie între 0 și 3.';
  } else if (value.type === 'estimation') {
    if (
      typeof value.targetNumber !== 'number' ||
      !Number.isFinite(value.targetNumber) ||
      Math.abs(value.targetNumber) > 1e15
    )
      return 'Întrebarea numerică trebuie să aibă o valoare numerică finită.';
    if (value.unit !== undefined && (typeof value.unit !== 'string' || value.unit.length > 30))
      return 'Unitatea de măsură este invalidă.';
  } else return 'Tipul întrebării trebuie să fie choice sau estimation.';
  return null;
}

function isDuplicateQuestion(candidate: any, ignoreId?: string): boolean {
  const normalized = String(candidate.question).trim().toLocaleLowerCase('ro');
  return db
    .getAllQuestions()
    .some(
      (existing) =>
        (existing.id === candidate.id && existing.id !== ignoreId) ||
        (existing.id !== ignoreId &&
          existing.type === candidate.type &&
          existing.category === candidate.category &&
          existing.question.trim().toLocaleLowerCase('ro') === normalized)
    );
}

// GET questions list with optional filtering
router.get('/', authenticate, requireAdmin, (req: AuthRequest, res: Response): void => {
  const { category, difficulty, type, search } = req.query;
  let questions = db.getAllQuestions();

  if (category) {
    questions = questions.filter((q) => q.category === category);
  }
  if (difficulty) {
    questions = questions.filter((q) => q.difficulty === difficulty);
  }
  if (type) {
    questions = questions.filter((q) => q.type === type);
  }
  if (search) {
    const term = String(search).toLowerCase();
    questions = questions.filter(
      (q) =>
        q.question.toLowerCase().includes(term) ||
        (q.explanation && q.explanation.toLowerCase().includes(term))
    );
  }

  res.json({ questions, total: questions.length });
});

// GET questions breakdown
router.get('/stats', authenticate, requireAdmin, (_req: AuthRequest, res: Response): void => {
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

// Admin: Add new question (defaults to reviewStatus = 'draft' unless explicitly approved with verified source)
router.post('/', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      type,
      category,
      difficulty,
      question,
      options,
      correctAnswerIndex,
      targetNumber,
      unit,
      explanation,
      sourceUrl,
      sourceTitle,
      sourceCheckedAt,
      factKey,
      reviewStatus,
    } = req.body;

    const validationError = validateQuestionPayload({
      type,
      category,
      difficulty,
      question,
      options,
      correctAnswerIndex,
      targetNumber,
      unit,
      explanation,
      sourceUrl,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    if (isDuplicateQuestion({ type, category, question })) {
      res.status(409).json({ error: 'Există deja o întrebare identică în aceeași categorie.' });
      return;
    }

    const resolvedStatus =
      reviewStatus === 'approved' && sourceUrl && sourceTitle && sourceCheckedAt
        ? 'approved'
        : 'draft';

    const id = `q_custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
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
      sourceTitle,
      sourceCheckedAt: resolvedStatus === 'approved' ? sourceCheckedAt : undefined,
      factKey: factKey || `fact_${category}_${id}`,
      reviewStatus: resolvedStatus,
      verified: resolvedStatus === 'approved',
    };

    const saved = await db.addQuestion(newQ);
    gameManager.reloadQuestions();
    const adminUser = req.userId ? db.findUserById(req.userId) : undefined;
    await db.recordAuditLog({
      adminId: req.userId || 'admin',
      adminUsername: adminUser?.username || 'admin',
      action: 'QUESTION_CREATE',
      targetType: 'question',
      targetId: saved.id,
      details: { category: saved.category, type: saved.type, reviewStatus: saved.reviewStatus },
    });
    res.json({ success: true, question: saved });
  } catch (err) {
    console.error('[Question Create Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la salvarea întrebării în baza de date.' });
  }
});

// Admin: Edit question
router.put('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const patch = req.body;
    const existing = db.getAllQuestions().find((q) => q.id === id);
    if (!existing) {
      res.status(404).json({ error: 'Întrebarea nu a fost găsită.' });
      return;
    }
    const merged = { ...existing, ...patch };
    const validationError = validateQuestionPayload(merged);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const allowedFields = [
      'type',
      'category',
      'difficulty',
      'question',
      'options',
      'correctAnswerIndex',
      'targetNumber',
      'unit',
      'explanation',
      'sourceUrl',
      'sourceTitle',
      'sourceCheckedAt',
      'factKey',
      'reviewStatus',
      'isDisabled',
    ];
    const safePatch = Object.fromEntries(
      Object.entries(patch || {}).filter(([key]) => allowedFields.includes(key))
    );
    if (isDuplicateQuestion(merged, id)) {
      res.status(409).json({ error: 'Există deja o întrebare identică în aceeași categorie.' });
      return;
    }
    const updated = await db.updateQuestion(id, safePatch);
    if (!updated) {
      res.status(404).json({ error: 'Întrebarea nu a fost găsită.' });
      return;
    }
    gameManager.reloadQuestions();
    const adminUser = req.userId ? db.findUserById(req.userId) : undefined;
    await db.recordAuditLog({
      adminId: req.userId || 'admin',
      adminUsername: adminUser?.username || 'admin',
      action: 'QUESTION_UPDATE',
      targetType: 'question',
      targetId: id,
      details: { updatedFields: Object.keys(safePatch) },
    });
    res.json({ success: true, question: updated });
  } catch (err) {
    console.error('[Question Update Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la actualizarea întrebării în baza de date.' });
  }
});

// Admin: Delete question
router.delete('/:id', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const ok = await db.deleteQuestion(id);
    if (!ok) {
      res.status(404).json({ error: 'Întrebarea nu a fost găsită.' });
      return;
    }
    gameManager.reloadQuestions();
    const adminUser = req.userId ? db.findUserById(req.userId) : undefined;
    await db.recordAuditLog({
      adminId: req.userId || 'admin',
      adminUsername: adminUser?.username || 'admin',
      action: 'QUESTION_DELETE',
      targetType: 'question',
      targetId: id,
    });
    res.json({ success: true, message: 'Întrebare ștearsă.' });
  } catch (err) {
    console.error('[Question Delete Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la ștergerea întrebării din baza de date.' });
  }
});

// Admin: Import questions from JSON array
router.post('/import', authenticate, requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions) || questions.length === 0 || questions.length > 1000) {
      res.status(400).json({ error: 'Trimiteți un array cu 1–1000 de întrebări.' });
      return;
    }

    let skipped = 0;
    const errors: string[] = [];
    const validCandidates: Question[] = [];
    const seenBatchFingerprints = new Set<string>();

    for (let index = 0; index < questions.length; index++) {
      const raw = questions[index];
      const id =
        typeof raw?.id === 'string' && raw.id.length <= 100
          ? raw.id
          : `q_custom_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 7)}`;
      const resolvedStatus =
        raw?.reviewStatus === 'approved' &&
        raw?.sourceUrl &&
        raw?.sourceTitle &&
        raw?.sourceCheckedAt
          ? 'approved'
          : 'draft';
      const candidate: Question = {
        id,
        type: raw?.type,
        category: raw?.category,
        difficulty: raw?.difficulty || 'mediu',
        question: raw?.question,
        options: raw?.options,
        correctAnswerIndex: raw?.correctAnswerIndex,
        targetNumber: raw?.targetNumber,
        unit: raw?.unit,
        explanation:
          typeof raw?.explanation === 'string' ? raw.explanation.slice(0, 1000) : '',
        sourceUrl: raw?.sourceUrl,
        sourceTitle: raw?.sourceTitle,
        sourceCheckedAt: resolvedStatus === 'approved' ? raw?.sourceCheckedAt : undefined,
        factKey: raw?.factKey || `fact_${raw?.category || 'cg'}_${id}`,
        reviewStatus: resolvedStatus,
        verified: resolvedStatus === 'approved',
      };
      const validationError = validateQuestionPayload(candidate);
      if (validationError) {
        skipped++;
        if (errors.length < 10) errors.push(`Rândul ${index + 1}: ${validationError}`);
        continue;
      }
      const normKey = `${candidate.type}::${candidate.category}::${String(candidate.question)
        .trim()
        .toLocaleLowerCase('ro')}`;
      if (isDuplicateQuestion(candidate) || seenBatchFingerprints.has(normKey)) {
        skipped++;
        continue;
      }
      seenBatchFingerprints.add(normKey);
      validCandidates.push(candidate);
    }

    if (validCandidates.length > 0) {
      await db.addQuestionsBatch(validCandidates);
      gameManager.reloadQuestions();
      const adminUser = req.userId ? db.findUserById(req.userId) : undefined;
      await db.recordAuditLog({
        adminId: req.userId || 'admin',
        adminUsername: adminUser?.username || 'admin',
        action: 'QUESTION_IMPORT',
        targetType: 'question_batch',
        targetId: `batch_${validCandidates.length}`,
        details: { imported: validCandidates.length, skipped },
      });
    }

    res.json({
      success: true,
      imported: validCandidates.length,
      skipped,
      errors,
      message: `Importate ${validCandidates.length} întrebări; ${skipped} ignorate (invalide sau duplicate).`,
    });
  } catch (err) {
    console.error('[Question Import Error]:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Eroare la importul întrebărilor în baza de date.' });
  }
});

export default router;
