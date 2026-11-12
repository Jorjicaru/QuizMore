/**
 * Utilitar centralizat pentru starea de mentenanță (MAINTENANCE_MODE) și jurnalul recent de erori server.
 */

export interface ServerErrorEntry {
  id: string;
  timestamp: string;
  scope: string;
  message: string;
}

const MAX_RECENT_ERRORS = 50;
const recentServerErrors: ServerErrorEntry[] = [];

export function isMaintenanceModeEnabled(): boolean {
  const raw = String(process.env.MAINTENANCE_MODE || '')
    .trim()
    .toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

export function getMaintenanceMessage(): string {
  const custom = String(process.env.MAINTENANCE_MESSAGE || '').trim();
  return (
    custom ||
    'Aplicația CONQUIZ este temporar oprită pentru lucrări de mentenanță și actualizare. Te rugăm să revii în câteva momente!'
  );
}

export function recordServerError(scope: string, error: unknown): void {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : 'Eroare internă neașteptată';

  // Sanitize any potential connection string or token pattern from error logs
  const sanitizedMessage = rawMessage
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 400);

  recentServerErrors.unshift({
    id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    scope,
    message: sanitizedMessage,
  });

  if (recentServerErrors.length > MAX_RECENT_ERRORS) {
    recentServerErrors.length = MAX_RECENT_ERRORS;
  }
}

export function getRecentServerErrors(limit = 20): ServerErrorEntry[] {
  return recentServerErrors.slice(0, Math.max(1, Math.min(MAX_RECENT_ERRORS, limit)));
}
