DROP TABLE IF EXISTS models;
CREATE TABLE models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  license TEXT,
  framework TEXT,
  task TEXT,
  category TEXT,
  github_url TEXT,
  huggingface_url TEXT,
  demo_url TEXT,
  stars INTEGER DEFAULT 0,
  last_updated TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  source TEXT NOT NULL DEFAULT 'huggingface'
);