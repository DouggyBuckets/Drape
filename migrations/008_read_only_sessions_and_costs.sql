-- "Try the demo" sessions are read-only; the owner's password login is not.
ALTER TABLE sessions ADD COLUMN read_only boolean NOT NULL DEFAULT false;
-- Estimated USD cost of each model-backed action, for the global daily spend cap.
ALTER TABLE usage_events ADD COLUMN cost_usd numeric(10, 4) NOT NULL DEFAULT 0;
