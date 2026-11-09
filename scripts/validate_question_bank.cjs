const fs = require('fs');
const path = require('path');

function normalizeQuestionText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateQuestionBank() {
  const choicePath = path.join(process.cwd(), 'data', 'questions', 'choice.json');
  const estimationPath = path.join(process.cwd(), 'data', 'questions', 'estimation.json');

  if (!fs.existsSync(choicePath) || !fs.existsSync(estimationPath)) {
    throw new Error('Fișierele canonice data/questions/choice.json sau estimation.json lipsesc.');
  }

  const choiceQuestions = JSON.parse(fs.readFileSync(choicePath, 'utf8'));
  const estimationQuestions = JSON.parse(fs.readFileSync(estimationPath, 'utf8'));
  const allQuestions = [...choiceQuestions, ...estimationQuestions];

  const seenIds = new Set();
  const seenTexts = new Set();
  const errors = [];
  const categoryBreakdown = {};
  const difficultyBreakdown = {};

  for (let i = 0; i < allQuestions.length; i++) {
    const q = allQuestions[i];
    if (!q.id || typeof q.id !== 'string') {
      errors.push(`Index ${i}: ID lipsă sau invalid.`);
    } else if (seenIds.has(q.id)) {
      errors.push(`ID duplicat detectat: ${q.id}`);
    } else {
      seenIds.add(q.id);
    }

    if (!q.question || typeof q.question !== 'string' || q.question.trim().length < 10) {
      errors.push(`ID ${q.id}: Textul întrebării este invalid sau prea scurt.`);
    } else {
      const fp = normalizeQuestionText(q.question);
      if (seenTexts.has(fp)) {
        errors.push(`ID ${q.id}: Textul întrebării este duplicat (${q.question}).`);
      } else {
        seenTexts.add(fp);
      }
    }

    if (q.type !== 'choice' && q.type !== 'estimation') {
      errors.push(`ID ${q.id}: Tip invalid (${q.type}).`);
    }

    if (q.type === 'choice') {
      if (!Array.isArray(q.options) || q.options.length !== 4) {
        errors.push(`ID ${q.id}: Întrebarea choice trebuie să aibă exact 4 opțiuni.`);
      } else {
        const normOpts = new Set(q.options.map((o) => normalizeQuestionText(o)));
        if (normOpts.size !== 4) {
          errors.push(`ID ${q.id}: Opțiunile de răspuns conțin duplicate.`);
        }
      }
      if (
        !Number.isInteger(q.correctAnswerIndex) ||
        q.correctAnswerIndex < 0 ||
        q.correctAnswerIndex > 3
      ) {
        errors.push(`ID ${q.id}: correctAnswerIndex invalid (${q.correctAnswerIndex}).`);
      }
    } else if (q.type === 'estimation') {
      if (typeof q.targetNumber !== 'number' || !Number.isFinite(q.targetNumber)) {
        errors.push(`ID ${q.id}: targetNumber invalid (${q.targetNumber}).`);
      }
      if (!q.unit || typeof q.unit !== 'string') {
        errors.push(`ID ${q.id}: unitate de măsură (unit) lipsă.`);
      }
    }

    if (!q.explanation || typeof q.explanation !== 'string') {
      errors.push(`ID ${q.id}: Explicație (explanation) lipsă.`);
    }
    if (!q.sourceUrl || typeof q.sourceUrl !== 'string') {
      errors.push(`ID ${q.id}: Sursă (sourceUrl) lipsă.`);
    }

    categoryBreakdown[q.category] = (categoryBreakdown[q.category] || 0) + 1;
    difficultyBreakdown[q.difficulty] = (difficultyBreakdown[q.difficulty] || 0) + 1;
  }

  if (allQuestions.length < 5000) {
    errors.push(`Baza canonică are doar ${allQuestions.length} întrebări (minim cerut: 5000).`);
  }
  if (choiceQuestions.length < 2500) {
    errors.push(`Prea puține întrebări choice: ${choiceQuestions.length} (minim 2500).`);
  }
  if (estimationQuestions.length < 2500) {
    errors.push(`Prea puține întrebări estimation: ${estimationQuestions.length} (minim 2500).`);
  }

  return {
    valid: errors.length === 0,
    totalQuestions: allQuestions.length,
    choiceCount: choiceQuestions.length,
    estimationCount: estimationQuestions.length,
    duplicateIds: 0,
    duplicateTexts: 0,
    categoryBreakdown,
    difficultyBreakdown,
    errors,
  };
}

if (require.main === module) {
  const report = validateQuestionBank();
  if (!report.valid) {
    console.error('Eroare la validarea băncii de întrebări:', report.errors.slice(0, 20));
    process.exit(1);
  }
  console.log('Validare bancă de întrebări reușită:', {
    totalQuestions: report.totalQuestions,
    choiceCount: report.choiceCount,
    estimationCount: report.estimationCount,
    categories: Object.keys(report.categoryBreakdown).length,
  });
}

module.exports = { validateQuestionBank, normalizeQuestionText };
