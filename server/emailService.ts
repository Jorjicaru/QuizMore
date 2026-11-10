import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { isPlaceholderValue, isAiStudioPreviewEnv } from './envSecurity';

export interface PasswordResetEmailPayload {
  toEmail: string;
  username: string;
  resetUrl: string;
  expiresInMinutes: number;
}

export type EmailSenderFn = (payload: PasswordResetEmailPayload) => Promise<void>;

let injectedEmailSender: EmailSenderFn | null = null;

export function setEmailSenderForTesting(sender: EmailSenderFn | null): void {
  injectedEmailSender = sender;
}

/**
 * Generează un token criptografic sigur de 256 biți (64 caractere hexazecimale).
 */
export function generateSecureResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Calculează hash-ul SHA-256 al tokenului de resetare.
 * În PostgreSQL se stochează EXCLUSIV acest hash, niciodată tokenul în clar.
 */
export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * Construiește URL-ul de resetare a parolei EXCLUSIV din variabila de mediu `APP_URL`,
 * niciodată din headerul HTTP `Host` sau `X-Forwarded-Host` (prevenind Host Header Injection).
 */
export function buildPasswordResetUrl(
  rawToken: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  const configuredAppUrl = String(env.APP_URL || '').trim();
  const isStrictProd =
    env.STRICT_ENV_VALIDATION === 'true' ||
    (env.NODE_ENV === 'production' && !isAiStudioPreviewEnv(env));

  let baseOrigin = 'http://localhost:3000';

  if (configuredAppUrl && !isPlaceholderValue(configuredAppUrl)) {
    try {
      const parsed = new URL(configuredAppUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('Protocol APP_URL invalid.');
      }
      baseOrigin = parsed.origin;
    } catch {
      if (isStrictProd) {
        throw new Error('APP_URL configurat este invalid pentru generarea linkului de resetare.');
      }
    }
  } else if (isStrictProd) {
    throw new Error('APP_URL trebuie configurat explicit în producție pentru resetarea parolei.');
  }

  return `${baseOrigin}/?resetToken=${encodeURIComponent(rawToken)}`;
}

/**
 * Curăță orice potențial token, URL, parolă sau adresă de email dintr-un mesaj de eroare SMTP
 * înainte de înregistrarea în logurile serverului.
 */
export function sanitizeSmtpErrorForLogging(err: unknown): string {
  const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown SMTP error');
  return rawMessage
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\b[a-f0-9]{32,128}\b/gi, '[REDACTED_TOKEN]')
    .slice(0, 200);
}

/**
 * Trimite emailul de resetare a parolei printr-un furnizor SMTP configurat prin variabile de mediu.
 */
export async function sendPasswordResetEmail(
  payload: PasswordResetEmailPayload,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  if (injectedEmailSender) {
    await injectedEmailSender(payload);
    return;
  }

  const smtpHost = String(env.SMTP_HOST || '').trim();
  const smtpPort = Number(env.SMTP_PORT || 587);
  const smtpSecure =
    env.SMTP_SECURE === 'true' || (env.SMTP_SECURE === undefined && smtpPort === 465);
  const smtpUser = String(env.SMTP_USER || '').trim();
  const smtpPass = String(env.SMTP_PASS || '');
  const smtpFrom = String(env.SMTP_FROM || '').trim();

  const isStrictProd =
    env.STRICT_ENV_VALIDATION === 'true' ||
    (env.NODE_ENV === 'production' && !isAiStudioPreviewEnv(env));

  if (
    !smtpHost ||
    !smtpFrom ||
    isPlaceholderValue(smtpHost) ||
    isPlaceholderValue(smtpFrom)
  ) {
    if (isStrictProd) {
      throw new Error('Configurația SMTP (SMTP_HOST / SMTP_FROM) lipsește sau este demonstrativă.');
    }
    // În development / Google AI Studio Preview fără SMTP configurat, nu expunem tokenul în loguri
    console.info(
      '[SMTP Dev Mode] Solicitare resetare parolă procesată în modul development (fără server SMTP extern configurat).'
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });

  const subject = 'CONQUIZ România – Resetarea parolei contului tău';
  const textBody = [
    `Salut, ${payload.username}!`,
    '',
    'Am primit o solicitare de resetare a parolei pentru contul tău CONQUIZ România.',
    `Acest link este de unică folosință și expiră în ${payload.expiresInMinutes} minute:`,
    payload.resetUrl,
    '',
    'Dacă nu ai solicitat schimbarea parolei, poți ignora în siguranță acest mesaj.',
  ].join('\n');

  const htmlBody = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid #334155;">
      <h2 style="color: #fbbf24; margin-top: 0;">CONQUIZ ROMÂNIA</h2>
      <p>Salut, <strong>${payload.username}</strong>!</p>
      <p>Am primit o solicitare de resetare a parolei pentru contul tău CONQUIZ România.</p>
      <p style="margin: 24px 0;">
        <a href="${payload.resetUrl}" style="background: #f59e0b; color: #0f172a; padding: 12px 20px; border-radius: 10px; text-decoration: none; font-weight: 700; display: inline-block;">
          Resetează Parola
        </a>
      </p>
      <p style="font-size: 13px; color: #94a3b8;">
        Acest link este de unică folosință și expiră în <strong>${payload.expiresInMinutes} minute</strong>.
        Dacă nu ai solicitat resetarea parolei, poți ignora acest mesaj.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: smtpFrom,
    to: payload.toEmail,
    subject,
    text: textBody,
    html: htmlBody,
  });
}
