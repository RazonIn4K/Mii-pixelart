-- Auditable, privacy-minimizing usage ledger for optional paid AI image
-- generation. Generated image bytes and prompt text are deliberately never
-- stored. The prompt hash supports incident correlation without retaining the
-- prompt, while the reservation makes concurrent daily-budget checks
-- authoritative in D1 before an upstream request is sent.

CREATE TABLE ai_image_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) = 36),
  prompt_sha256 TEXT NOT NULL CHECK (length(prompt_sha256) = 64),
  model TEXT NOT NULL CHECK (
    model IN (
      'google/gemini-3.1-flash-lite-image',
      'google/gemini-3.1-flash-image'
    )
  ),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'complete', 'failed')),
  reserved_cost_microusd INTEGER NOT NULL
    CHECK (reserved_cost_microusd = 150000),
  actual_cost_microusd INTEGER
    CHECK (actual_cost_microusd BETWEEN 0 AND 150000),
  error_code TEXT CHECK (
    error_code IS NULL OR length(error_code) BETWEEN 1 AND 64
  ),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  UNIQUE (user_id, idempotency_key),
  CHECK (
    (status = 'pending' AND completed_at IS NULL AND actual_cost_microusd IS NULL AND error_code IS NULL) OR
    (status = 'complete' AND completed_at IS NOT NULL AND actual_cost_microusd IS NOT NULL AND error_code IS NULL) OR
    (status = 'failed' AND completed_at IS NOT NULL AND actual_cost_microusd IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX ai_image_requests_user_daily_idx
  ON ai_image_requests(user_id, created_at DESC);

CREATE INDEX ai_image_requests_global_budget_idx
  ON ai_image_requests(created_at, status);

CREATE INDEX ai_image_requests_stale_pending_idx
  ON ai_image_requests(created_at)
  WHERE status = 'pending';
