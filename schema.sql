CREATE TABLE IF NOT EXISTS router_configs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS router_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  seq_index INTEGER NOT NULL DEFAULT 0,
  random_remaining TEXT,
  config_signature TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
