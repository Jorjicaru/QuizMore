-- CONQUIZ V10.1 – Admin Leaderboard Override & User Feedback Migration (004_admin_and_feedback.sql)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS manual_rank_override INTEGER NULL;

CREATE TABLE IF NOT EXISTS app_feedback (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NULL,
  username VARCHAR(64) NULL,
  category VARCHAR(32) NOT NULL CHECK (category IN ('problema_tehnica', 'intrebare_gresita', 'idee_imbunatatire', 'altceva')),
  message TEXT NOT NULL,
  room_id VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'nou' CHECK (status IN ('nou', 'in_verificare', 'rezolvat')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_created_at ON app_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_feedback_status_category ON app_feedback (status, category, created_at DESC);
