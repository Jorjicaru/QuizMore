-- CONQUIZ V9.2 – Password Reset & Session Token Version Migration (002_password_reset.sql)
-- 1. Asigură coloana `token_version` pe tabelul `users` pentru invalidarea sesiunilor/JWT-urilor la schimbarea parolei.
-- 2. Creează tabelul `password_reset_tokens` care stochează EXCLUSIV hash-ul SHA-256 al tokenului de resetare,
--    cu expirare, consum de unică folosință (`used_at`) și invalidarea tokenurilor anterioare (`invalidated_at`).

ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);
