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
  const exampleDbPath = path.join(process.cwd(), 'data', 'conquiz_db.example.json');

  if (!fs.existsSync(choicePath) || !fs.existsSync(estimationPath)) {
    throw new Error('Fișierele canonice data/questions/choice.json sau estimation.json lipsesc.');
  }

  const choiceQuestions = JSON.parse(fs.readFileSync(choicePath, 'utf8'));
  const estimationQuestions = JSON.parse(fs.readFileSync(estimationPath, 'utf8'));
  const allQuestions = [...choiceQuestions, ...estimationQuestions];

  const seenIds = new Set();
  const seenTexts = new Set();
  const seenFactKeys = new Set();
  const errors = [];
  const categoryBreakdown = {};
  const difficultyBreakdown = {};
  const reviewStatusBreakdown = { approved: 0, draft: 0, rejected: 0, disabled: 0 };

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
    if (!q.factKey || typeof q.factKey !== 'string') {
      errors.push(`ID ${q.id}: Cheia factKey lipsă.`);
    } else {
      seenFactKeys.add(q.factKey);
    }

    const status = q.reviewStatus || (q.verified ? 'approved' : 'draft');
    reviewStatusBreakdown[status] = (reviewStatusBreakdown[status] || 0) + 1;

    if (status === 'approved') {
      if (!q.sourceUrl || typeof q.sourceUrl !== 'string') {
        errors.push(`ID ${q.id}: Sursă (sourceUrl) lipsă pentru întrebare aprobată.`);
      } else {
        try {
          const parsedUrl = new URL(q.sourceUrl);
          if (!parsedUrl.pathname || parsedUrl.pathname === '/' || parsedUrl.pathname.trim() === '') {
            errors.push(`ID ${q.id}: Sursă generică (homepage) nepermisă pentru întrebare aprobată (${q.sourceUrl}).`);
          }
        } catch {
          errors.push(`ID ${q.id}: URL sursă invalid (${q.sourceUrl}).`);
        }
      }
      if (!q.sourceTitle || typeof q.sourceTitle !== 'string') {
        errors.push(`ID ${q.id}: Titlul sursei (sourceTitle) lipsă pentru întrebare aprobată.`);
      }
      if (!q.sourceCheckedAt || typeof q.sourceCheckedAt !== 'string') {
        errors.push(`ID ${q.id}: Data verificării sursei (sourceCheckedAt) lipsă pentru întrebare aprobată.`);
      }
    }

    categoryBreakdown[q.category] = (categoryBreakdown[q.category] || 0) + 1;
    difficultyBreakdown[q.difficulty] = (difficultyBreakdown[q.difficulty] || 0) + 1;
  }

  const approvedChoice = choiceQuestions.filter((q) => (q.reviewStatus || 'approved') === 'approved').length;
  const approvedEstimation = estimationQuestions.filter((q) => (q.reviewStatus || 'approved') === 'approved').length;

  if (reviewStatusBreakdown.approved < 5000) {
    errors.push(`Baza canonică are doar ${reviewStatusBreakdown.approved} întrebări aprobate (minim cerut: 5000).`);
  }
  if (approvedChoice < 2500) {
    errors.push(`Prea puține întrebări choice aprobate: ${approvedChoice} (minim 2500).`);
  }
  if (approvedEstimation < 2500) {
    errors.push(`Prea puține întrebări estimation aprobate: ${approvedEstimation} (minim 2500).`);
  }

  // Verify category balance (no single category should dominate > 25% of the bank)
  for (const [cat, count] of Object.entries(categoryBreakdown)) {
    const share = count / Math.max(1, allQuestions.length);
    if (share > 0.25) {
      errors.push(`Categoria ${cat} domină disproporționat banca de întrebări (${(share * 100).toFixed(1)}% > 25%).`);
    }
    if (count < 150) {
      errors.push(`Categoria ${cat} are prea puține întrebări (${count} < 150).`);
    }
  }

  // Verify data/conquiz_db.example.json has users as a plain object {} (not array [])
  if (fs.existsSync(exampleDbPath)) {
    const exDb = JSON.parse(fs.readFileSync(exampleDbPath, 'utf8'));
    if (!exDb.users || typeof exDb.users !== 'object' || Array.isArray(exDb.users)) {
      errors.push('data/conquiz_db.example.json are câmpul "users" invalid (trebuie să fie obiect {}, nu array []).');
    }
  }

  return {
    valid: errors.length === 0,
    totalQuestions: allQuestions.length,
    approvedCount: reviewStatusBreakdown.approved,
    uniqueFactKeysCount: seenFactKeys.size,
    choiceCount: choiceQuestions.length,
    estimationCount: estimationQuestions.length,
    duplicateIds: 0,
    duplicateTexts: 0,
    reviewStatusBreakdown,
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
  console.log('Validare bancă de întrebări V9.0 reușită:', {
    totalQuestions: report.totalQuestions,
    approvedCount: report.approvedCount,
    uniqueFactKeysCount: report.uniqueFactKeysCount,
    choiceCount: report.choiceCount,
    estimationCount: report.estimationCount,
    categories: Object.keys(report.categoryBreakdown).length,
    categoryBreakdown: report.categoryBreakdown,
  });
}

module.exports = { validateQuestionBank, normalizeQuestionText };
