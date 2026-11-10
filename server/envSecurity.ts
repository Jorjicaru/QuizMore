/**
 * CONQUIZ V9.1 – Modul de validare strictă a variabilelor de mediu pentru producție.
 * Respinge orice valoare demonstrativă (română sau engleză), parolă slabă sau placeholder din .env.example.
 */

const PLACEHOLDER_REGEX =
  /schimba|inlocuieste|exemplu|parola_ta|parola_admin|parola_postgres|secret_aici|token_aici|adresa-ta|domeniu\.ro|exemplu-domeniu\.ro|conquiz\.ro|replace|change-me|changeme|your-password|your_password|your-secret|example|placeholder|parolaadmin|parolapostgres|admin123|password123|default_secret|unset/i;

export function isPlaceholderValue(value: string | undefined | null): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (PLACEHOLDER_REGEX.test(trimmed)) return true;
  if (/^<.*>$/.test(trimmed) || /^\$\{.*\}$/.test(trimmed)) return true;
  return false;
}

export function hasSufficientEntropy(value: string, minUniqueChars = 8): boolean {
  const unique = new Set(value.trim().split(''));
  return unique.size >= minUniqueChars;
}

export function isAiStudioPreviewEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const appUrl = String(env.APP_URL || '');
  const isDefaultProcessEnv = env === process.env;
  return (
    /\.run\.app$/i.test(appUrl) ||
    Boolean(env.K_SERVICE) ||
    Boolean(env.K_REVISION) ||
    Boolean(env.AISTUDIO_APPLET_ID) ||
    Boolean(env.CLOUD_RUN_JOB) ||
    (isDefaultProcessEnv && process.cwd() === '/app/applet' && env.STRICT_ENV_VALIDATION !== 'true')
  );
}

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validează toate variabilele critice de securitate pentru rularea în producție.
 * Poate fi apelată direct în teste cu un obiect `env` (inclusiv cel parsat din `.env.example`).
 */
export function validateProductionEnv(env: NodeJS.ProcessEnv = process.env): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. JWT_SECRET
  const jwtSecret = String(env.JWT_SECRET || '').trim();
  if (!jwtSecret) {
    errors.push('JWT_SECRET lipsește. În producție este obligatorie o valoare aleatorie de minimum 32 de caractere.');
  } else if (jwtSecret.length < 32) {
    errors.push('JWT_SECRET este prea scurt (minimum 32 de caractere).');
  } else if (isPlaceholderValue(jwtSecret) || !hasSufficientEntropy(jwtSecret, 8)) {
    errors.push('JWT_SECRET conține o valoare demonstrativă/placeholder sau are entropie insuficientă.');
  }

  // 2. ADMIN_EMAIL & ADMIN_USERNAME & ADMIN_PASSWORD
  const adminEmail = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminUsername = String(env.ADMIN_USERNAME || '').trim();
  const adminPassword = String(env.ADMIN_PASSWORD || '');

  if (!adminEmail) {
    errors.push('ADMIN_EMAIL lipsește în configurația de producție.');
  } else if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) ||
    isPlaceholderValue(adminEmail) ||
    adminEmail.endsWith('@example.com') ||
    adminEmail.endsWith('@exemplu.ro')
  ) {
    errors.push('ADMIN_EMAIL este invalid sau folosește o adresă demonstrativă din .env.example.');
  }

  if (!adminPassword) {
    errors.push('ADMIN_PASSWORD lipsește în configurația de producție.');
  } else if (adminPassword.length < 16 || adminPassword.length > 128) {
    errors.push('ADMIN_PASSWORD trebuie să aibă între 16 și 128 de caractere.');
  } else if (
    isPlaceholderValue(adminPassword) ||
    !hasSufficientEntropy(adminPassword, 6) ||
    adminPassword.toLowerCase() === adminEmail ||
    (adminUsername && adminPassword.toLowerCase() === adminUsername.toLowerCase())
  ) {
    errors.push('ADMIN_PASSWORD este demonstrativă, slabă sau identică cu numele de utilizator/emailul.');
  }

  // 3. POSTGRES_PASSWORD & DATABASE_URL
  const pgPassword = String(env.POSTGRES_PASSWORD || '');
  const dbUrl = String(env.DATABASE_URL || '').trim();

  if (!dbUrl) {
    errors.push('DATABASE_URL lipsește. În producție PostgreSQL este sursa obligatorie de date.');
  } else {
    try {
      const parsedDbUrl = new URL(dbUrl);
      if (parsedDbUrl.protocol !== 'postgresql:' && parsedDbUrl.protocol !== 'postgres:') {
        errors.push('DATABASE_URL trebuie să folosească protocolul postgresql:// sau postgres://.');
      }
      const urlPassword = decodeURIComponent(parsedDbUrl.password || '');
      if (!urlPassword || urlPassword.length < 16 || isPlaceholderValue(urlPassword)) {
        errors.push('Parola din DATABASE_URL este absentă, prea scurtă (< 16 caractere) sau demonstrativă.');
      }
    } catch {
      errors.push('DATABASE_URL nu este un URL valid.');
    }
  }

  if (pgPassword) {
    if (pgPassword.length < 16 || isPlaceholderValue(pgPassword) || !hasSufficientEntropy(pgPassword, 6)) {
      errors.push('POSTGRES_PASSWORD este prea scurtă (< 16 caractere) sau folosește o valoare demonstrativă.');
    }
  }

  // 4. APP_URL
  const appUrl = String(env.APP_URL || '').trim();
  if (appUrl) {
    if (isPlaceholderValue(appUrl)) {
      errors.push('APP_URL conține un domeniu demonstrativ/placeholder.');
    } else {
      try {
        const parsedApp = new URL(appUrl);
        if (parsedApp.protocol !== 'https:' && parsedApp.protocol !== 'http:') {
          errors.push('APP_URL trebuie să înceapă cu https:// sau http://.');
        }
      } catch {
        errors.push('APP_URL nu este un URL valid.');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Aruncă o eroare fatală dacă aplicația rulează în producție (`NODE_ENV === 'production'`)
 * cu variabile demonstrative, slabe sau invalide.
 */
export function assertSafeRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const isProd = env.NODE_ENV === 'production';
  const forceStrict = env.STRICT_ENV_VALIDATION === 'true';

  if (forceStrict || (isProd && !isAiStudioPreviewEnv(env))) {
    const result = validateProductionEnv(env);
    if (!result.valid) {
      throw new Error(
        `[SECURITATE PRODUCȚIE] Pornirea aplicației a fost oprită:\n- ${result.errors.join('\n- ')}`
      );
    }
  }
}
