CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         citext NOT NULL UNIQUE,          -- case-insensitive uniqueness
  password_hash text NOT NULL,
  is_demo       boolean NOT NULL DEFAULT false,  -- shared read-only demo account
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- At most one demo account.
CREATE UNIQUE INDEX users_single_demo_idx ON users (is_demo) WHERE is_demo;

-- Only a SHA-256 hash of each session token is stored, so a database leak can't be replayed as logins.
CREATE TABLE sessions (
  token_hash bytea PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Counts billable or abusable actions for quotas (Stage 5.3).
CREATE TABLE usage_events (
  id         bigserial PRIMARY KEY,
  user_id    uuid REFERENCES users (id) ON DELETE CASCADE,
  ip         inet,
  kind       text NOT NULL CHECK (kind IN ('signup', 'upload', 'outfit')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX usage_events_kind_time_idx ON usage_events (kind, created_at);
CREATE INDEX usage_events_user_kind_time_idx ON usage_events (user_id, kind, created_at);
