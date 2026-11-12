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

const DANGLING_END_WORDS = new Set([
  'al', 'a', 'ai', 'ale', 'in', 'de', 'la', 'pe', 'cu', 'din', 'pentru',
  'si', 'sau', 'catre', 'dupa', 'sub', 'intre', 'prin', 'despre', 'asupra',
  'contra', 'fara', 'pana', 'impotriva', 'domnitorului', 'domnitorul', 'lui',
]);

const GENERIC_TOKENS = new Set([
  'varful', 'muntii', 'masivul', 'raul', 'fluviul', 'lacul', 'marea',
  'limbajul', 'programare', 'primul', 'prima', 'sistemul', 'compania',
  'motorul', 'opera', 'filmul', 'tabloul', 'statul', 'orasul', 'municipiul',
  'judetul', 'regiunea', 'insula', 'republica', 'romania', 'romaniei',
  'romana', 'romaneasca', 'europa', 'america', 'nord', 'sud', 'est', 'vest',
  'mare', 'mica', 'noua', 'veche', 'cel', 'cea', 'cei', 'cele', 'din', 'pentru',
]);

function validateQuestionBank() {
  const choicePath = path.join(process.cwd(), 'data', 'questions', 'choice.json');
  const estimationPath = path.join(process.cwd(), 'data', 'questions', 'estimation.json');
  const archivePath = path.join(process.cwd(), 'data', 'questions', 'archive_v91_original.json');
  const exampleDbPath = path.join(process.cwd(), 'data', 'conquiz_db.example.json');

  if (!fs.existsSync(choicePath) || !fs.existsSync(estimationPath)) {
    throw new Error('Fișierele canonice data/questions/choice.json sau estimation.json lipsesc.');
  }

  const choiceQuestions = JSON.parse(fs.readFileSync(choicePath, 'utf8'));
  const estimationQuestions = JSON.parse(fs.readFileSync(estimationPath, 'utf8'));
  const allQuestions = [...choiceQuestions, ...estimationQuestions];

  const seenIds = new Set();
  const seenActiveTexts = new Set();
  const seenFactKeys = new Set();
  const sourceUrlCounts = new Map();
  const errors = [];
  const categoryBreakdown = {};
  const activeCategoryBreakdown = {};
  const difficultyBreakdown = {};
  const reviewStatusBreakdown = { approved: 0, draft: 0, rejected: 0, disabled: 0 };
  let maxWordCount = 0;

  if (!fs.existsSync(archivePath)) {
    errors.push('Arhiva originală data/questions/archive_v91_original.json lipsește.');
  } else {
    const archiveRaw = JSON.parse(fs.readFileSync(archivePath, 'utf8'));
    const origCount = (archiveRaw.choice?.length || 0) + (archiveRaw.estimation?.length || 0);
    if (origCount !== 6241) {
      errors.push(`Arhiva originală trebuie să conțină exact 6.241 înregistrări (actual: ${origCount}).`);
    }
  }

  if (allQuestions.length !== 6241) {
    errors.push(`Banca totală trebuie să păstreze cele 6.241 de înregistrări (actual: ${allQuestions.length}).`);
  }

  for (let i = 0; i < allQuestions.length; i++) {
    const q = allQuestions[i];
    if (!q.id || typeof q.id !== 'string') {
      errors.push(`Index ${i}: ID lipsă sau invalid.`);
    } else if (seenIds.has(q.id)) {
      errors.push(`ID duplicat detectat: ${q.id}`);
    } else {
      seenIds.add(q.id);
    }

    const status =
      q.reviewStatus === 'approved' ||
      q.reviewStatus === 'draft' ||
      q.reviewStatus === 'rejected' ||
      q.reviewStatus === 'disabled'
        ? q.reviewStatus
        : 'draft';

    if (!q.reviewStatus) {
      errors.push(`ID ${q.id}: reviewStatus lipsă (nu este permisă aprobarea implicită).`);
    }

    const isActive = status === 'approved' && !q.isDisabled;
    reviewStatusBreakdown[status] = (reviewStatusBreakdown[status] || 0) + 1;
    categoryBreakdown[q.category] = (categoryBreakdown[q.category] || 0) + 1;
    difficultyBreakdown[q.difficulty] = (difficultyBreakdown[q.difficulty] || 0) + 1;

    if (q.factKey && typeof q.factKey === 'string') {
      seenFactKeys.add(q.factKey);
    } else {
      errors.push(`ID ${q.id}: Cheia factKey lipsă.`);
    }

    if (!isActive) {
      continue;
    }

    activeCategoryBreakdown[q.category] = (activeCategoryBreakdown[q.category] || 0) + 1;

    if (q.type !== 'choice') {
      errors.push(`ID ${q.id}: Întrebările active trebuie să fie exclusiv de tip 'choice' (actual: ${q.type}).`);
    }

    if (!q.question || typeof q.question !== 'string' || q.question.trim().length < 10) {
      errors.push(`ID ${q.id}: Textul întrebării este invalid sau prea scurt.`);
    } else {
      const wordCount = q.question.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount > maxWordCount) maxWordCount = wordCount;
      if (wordCount < 4 || wordCount > 15) {
        errors.push(`ID ${q.id}: Întrebarea activă are ${wordCount} cuvinte (permis 4..15: "${q.question}").`);
      }
      if (!q.question.trim().endsWith('?')) {
        errors.push(`ID ${q.id}: Întrebarea activă nu se termină cu '?': "${q.question}"`);
      }

      // Check for parenthesized number/index/metadata leaks: (21.2), (#4), (set ...), (seria ...)
      if (
        /\(\d+(?:\.\d+)?\)/.test(q.question) ||
        /\(#\d+\)/.test(q.question) ||
        /\(set\s+/i.test(q.question) ||
        /\(seria\s+/i.test(q.question)
      ) {
        errors.push(`ID ${q.id}: Scurgere de metadate/număr în paranteză în întrebare: "${q.question}"`);
      }

      // Check for truncated endings
      if (!/[”"]\?$/.test(q.question)) {
        const strippedEnd = q.question.replace(/[?')\s]+$/g, '');
        const lastWord = normalizeQuestionText(strippedEnd.split(/\s+/).pop() || '');
        if (DANGLING_END_WORDS.has(lastWord)) {
          errors.push(`ID ${q.id}: Enunț trunchiat la final ("${lastWord}"): "${q.question}"`);
        }
      }

      const fp = normalizeQuestionText(q.question);
      if (seenActiveTexts.has(fp)) {
        errors.push(`ID ${q.id}: Textul întrebării active este duplicat (${q.question}).`);
      } else {
        seenActiveTexts.add(fp);
      }
    }

    if (!Array.isArray(q.options) || q.options.length !== 4) {
      errors.push(`ID ${q.id}: Întrebarea choice trebuie să aibă exact 4 opțiuni.`);
    } else {
      const normOpts = new Set(q.options.map((o) => normalizeQuestionText(o)));
      if (normOpts.size !== 4) {
        errors.push(`ID ${q.id}: Opțiunile de răspuns conțin duplicate.`);
      }
      if (
        !Number.isInteger(q.correctAnswerIndex) ||
        q.correctAnswerIndex < 0 ||
        q.correctAnswerIndex > 3
      ) {
        errors.push(`ID ${q.id}: correctAnswerIndex invalid (${q.correctAnswerIndex}).`);
      } else {
        // Check that the correct answer is NOT leaked in the question prompt
        const correctOpt = q.options[q.correctAnswerIndex];
        const normPrompt = normalizeQuestionText(q.question);
        const normPromptTokens = new Set(normPrompt.split(' ').filter(Boolean));
        const normCorrect = normalizeQuestionText(correctOpt);

        if (normCorrect.length >= 2 && ` ${normPrompt} `.includes(` ${normCorrect} `)) {
          errors.push(
            `ID ${q.id}: Răspunsul corect "${correctOpt}" este scurs direct în enunț: "${q.question}"`
          );
        }

        for (const token of normCorrect.split(' ')) {
          if (token.length >= 5 && !GENERIC_TOKENS.has(token) && !/^\d+$/.test(token)) {
            if (normPromptTokens.has(token)) {
              errors.push(
                `ID ${q.id}: Cuvânt-cheie din răspuns ("${token}" din "${correctOpt}") scurs în enunț: "${q.question}"`
              );
            }
          }
        }
      }
    }

    if (!q.explanation || typeof q.explanation !== 'string') {
      errors.push(`ID ${q.id}: Explicație (explanation) lipsă.`);
    }

    if (!q.sourceUrl || typeof q.sourceUrl !== 'string') {
      errors.push(`ID ${q.id}: Sursă (sourceUrl) lipsă pentru întrebare aprobată.`);
    } else {
      try {
        const parsedUrl = new URL(q.sourceUrl);
        if (!parsedUrl.pathname || parsedUrl.pathname === '/' || parsedUrl.pathname.trim() === '') {
          errors.push(`ID ${q.id}: Sursă generică (homepage) nepermisă pentru întrebare aprobată (${q.sourceUrl}).`);
        }
        sourceUrlCounts.set(q.sourceUrl, (sourceUrlCounts.get(q.sourceUrl) || 0) + 1);
      } catch {
        errors.push(`ID ${q.id}: URL sursă invalid (${q.sourceUrl}).`);
      }
    }
    if (!q.sourceTitle || typeof q.sourceTitle !== 'string' || q.sourceTitle.trim().length < 5) {
      errors.push(`ID ${q.id}: Titlul sursei (sourceTitle) lipsă sau prea scurt pentru întrebare aprobată.`);
    }
    if (!q.sourceCheckedAt || typeof q.sourceCheckedAt !== 'string') {
      errors.push(`ID ${q.id}: Data verificării sursei (sourceCheckedAt) lipsă pentru întrebare aprobată.`);
    }
  }

  const activeApproved = allQuestions.filter((q) => q.reviewStatus === 'approved' && !q.isDisabled);
  const activeChoice = activeApproved.filter((q) => q.type === 'choice').length;
  const activeEstimation = activeApproved.filter((q) => q.type === 'estimation').length;

  if (activeChoice < 1000) {
    errors.push(`Baza canonică are doar ${activeChoice} întrebări choice aprobate active (minim cerut: 1000).`);
  }
  if (activeEstimation !== 0) {
    errors.push(`Nu mai sunt permise întrebări de estimare active în fluxul de joc (găsite: ${activeEstimation}).`);
  }

  for (const [url, count] of sourceUrlCounts.entries()) {
    if (count > 250) {
      errors.push(
        `URL-ul sursă ${url} este reutilizat excesiv (${count} întrebări); fiecare subiect trebuie să aibă sursă specifică.`
      );
    }
  }

  if (fs.existsSync(exampleDbPath)) {
    const exDb = JSON.parse(fs.readFileSync(exampleDbPath, 'utf8'));
    if (!exDb.users || typeof exDb.users !== 'object' || Array.isArray(exDb.users)) {
      errors.push('data/conquiz_db.example.json are câmpul "users" invalid (trebuie să fie obiect {}, nu array []).');
    }
  }

  return {
    valid: errors.length === 0,
    totalQuestions: allQuestions.length,
    approvedCount: activeApproved.length,
    disabledCount: reviewStatusBreakdown.disabled,
    activeChoiceCount: activeChoice,
    activeEstimationCount: activeEstimation,
    uniqueFactKeysCount: seenFactKeys.size,
    uniqueSourceUrlsCount: sourceUrlCounts.size,
    choiceCount: choiceQuestions.length,
    estimationCount: estimationQuestions.length,
    duplicateIds: 0,
    duplicateTexts: 0,
    reviewStatusBreakdown,
    categoryBreakdown,
    activeCategoryBreakdown,
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
  console.log('Validare bancă de întrebări V9.4 reușită:', {
    totalQuestions: report.totalQuestions,
    approvedCount: report.approvedCount,
    disabledCount: report.disabledCount,
    activeChoiceCount: report.activeChoiceCount,
    activeEstimationCount: report.activeEstimationCount,
    uniqueFactKeysCount: report.uniqueFactKeysCount,
    uniqueSourceUrlsCount: report.uniqueSourceUrlsCount,
    choiceCount: report.choiceCount,
    estimationCount: report.estimationCount,
    activeCategories: Object.keys(report.activeCategoryBreakdown).length,
    activeCategoryBreakdown: report.activeCategoryBreakdown,
  });
}

module.exports = { validateQuestionBank, normalizeQuestionText };
