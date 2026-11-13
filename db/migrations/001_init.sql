-- CONQUIZ V9.1 – PostgreSQL Production Schema Migration (001_init.sql)
-- Sursa principală de date în producție. Tabele:
--   1. users
--   2. questions
--   3. games
--   4. game_player_results (cu constrângere unică pe (game_id, user_id))
--   5. friends (stochează cererile 'pending' și prieteniile 'accepted')
--   6. notifications
--   7. admin_audit_logs
--   8. active_game_snapshots

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  is_banned BOOLEAN NOT NULL DEFAULT FALSE,
  avatar VARCHAR(64) NOT NULL DEFAULT 'av_vlad',
  title VARCHAR(128) NOT NULL DEFAULT 'Răzeș',
  rating INTEGER NOT NULL DEFAULT 1200,
  matches_played INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  territories_conquered INTEGER NOT NULL DEFAULT 0,
  correct_answers_total INTEGER NOT NULL DEFAULT 0,
  highest_score INTEGER NOT NULL DEFAULT 0,
  token_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_rating ON users (rating DESC);

CREATE TABLE IF NOT EXISTS questions (
  id VARCHAR(128) PRIMARY KEY,
  category VARCHAR(64) NOT NULL,
  difficulty VARCHAR(32) NOT NULL DEFAULT 'mediu',
  type VARCHAR(32) NOT NULL CHECK (type IN ('choice', 'estimation')),
  question TEXT NOT NULL,
  normalized_fingerprint TEXT NOT NULL,
  fact_key VARCHAR(160) NOT NULL,
  options_json JSONB,
  correct_answer_index SMALLINT,
  target_number DOUBLE PRECISION,
  unit VARCHAR(64),
  explanation TEXT NOT NULL,
  source_url TEXT,
  source_title TEXT,
  source_checked_at VARCHAR(32),
  review_status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'approved', 'rejected', 'disabled')),
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  reported_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_selection ON questions (review_status, is_disabled, type, category);
CREATE INDEX IF NOT EXISTS idx_questions_fact_key ON questions (fact_key);

-- Active prompts must be unique; the archived bank intentionally retains inactive legacy duplicates.
ALTER TABLE questions DROP CONSTRAINT IF EXISTS questions_normalized_fingerprint_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_questions_active_normalized_fingerprint
  ON questions (normalized_fingerprint)
  WHERE review_status = 'approved' AND is_disabled = FALSE;

CREATE TABLE IF NOT EXISTS games (
  id VARCHAR(128) PRIMARY KEY,
  room_id VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  player_count SMALLINT NOT NULL,
  winner_id VARCHAR(128),
  winner_username VARCHAR(64),
  players_summary JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);

CREATE TABLE IF NOT EXISTS game_player_results (
  id SERIAL PRIMARY KEY,
  game_id VARCHAR(128) NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id VARCHAR(128) NOT NULL,
  username VARCHAR(64) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  territories INTEGER NOT NULL DEFAULT 0,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  is_winner BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_game_player_result UNIQUE (game_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_game_player_results_game_user ON game_player_results (game_id, user_id);
CREATE INDEX IF NOT EXISTS idx_game_player_results_user ON game_player_results (user_id);

CREATE TABLE IF NOT EXISTS friends (
  id VARCHAR(128) PRIMARY KEY,
  requester_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_friends_pair UNIQUE (requester_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends (requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_recipient ON friends (recipient_id);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(128) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(32) NOT NULL CHECK (type IN ('friend_request', 'game_invite', 'system')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id VARCHAR(128) PRIMARY KEY,
  admin_user_id VARCHAR(128),
  action VARCHAR(128) NOT NULL,
  target_id VARCHAR(128),
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS active_game_snapshots (
  room_id VARCHAR(32) PRIMARY KEY,
  phase VARCHAR(32) NOT NULL,
  player_count SMALLINT NOT NULL,
  state_json JSONB NOT NULL,
  interrupted_by_shutdown BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
