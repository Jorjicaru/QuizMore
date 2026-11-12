-- 003_audit_logs.sql
-- Jurnalizare auditată pentru acțiunile de administrare CONQUIZ V9.2

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(96) PRIMARY KEY,
  admin_id VARCHAR(96) NOT NULL,
  admin_username VARCHAR(120) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target_type VARCHAR(64) NOT NULL,
  target_id VARCHAR(120) NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON audit_logs (admin_id);
