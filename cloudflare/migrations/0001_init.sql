-- TIMBR3 anonymous preset storage
CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  anon_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_presets_anon_updated
  ON presets (anon_hash, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_presets_anon_name
  ON presets (anon_hash, name);
