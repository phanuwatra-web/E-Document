-- DocSign Database Schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS departments (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  employee_id   VARCHAR(20)  NOT NULL UNIQUE,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id            SERIAL PRIMARY KEY,
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  file_path     VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_size     BIGINT,
  department_id INTEGER REFERENCES departments(id) ON DELETE SET NULL,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS document_assignments (
  id          SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed')),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

CREATE TABLE IF NOT EXISTS signatures (
  id             SERIAL PRIMARY KEY,
  document_id    INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  signature_type VARCHAR(10) NOT NULL CHECK (signature_type IN ('click', 'draw')),
  signature_data TEXT,
  ip_address     VARCHAR(45),
  page_num       INTEGER       NOT NULL DEFAULT 1     CHECK (page_num >= 1),
  x_pct          NUMERIC(5,4)  NOT NULL DEFAULT 0.05  CHECK (x_pct >= 0 AND x_pct <= 1),
  y_pct          NUMERIC(5,4)  NOT NULL DEFAULT 0.10  CHECK (y_pct >= 0 AND y_pct <= 1),
  width_pct      NUMERIC(5,4)  NOT NULL DEFAULT 0.22  CHECK (width_pct > 0 AND width_pct <= 1),
  signed_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(document_id, user_id)
);

-- Idempotent migration for databases created before these columns existed
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS page_num  INTEGER      NOT NULL DEFAULT 1;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS x_pct     NUMERIC(5,4) NOT NULL DEFAULT 0.05;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS y_pct     NUMERIC(5,4) NOT NULL DEFAULT 0.10;
ALTER TABLE signatures ADD COLUMN IF NOT EXISTS width_pct NUMERIC(5,4) NOT NULL DEFAULT 0.22;

CREATE INDEX IF NOT EXISTS idx_users_employee_id   ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_department    ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_documents_dept      ON documents(department_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user    ON document_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_doc     ON document_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_doc      ON signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signatures_user     ON signatures(user_id);

-- ============================================================================
-- Audit Log (append-only)
-- Stores every security-relevant action so admins can answer "who did what,
-- when, from where". Rows are NEVER updated or deleted by application code.
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL PRIMARY KEY,
  -- user_id is SET NULL on user delete so the log row survives the user.
  -- actor_label keeps a human-readable snapshot of the actor at log time
  -- (e.g. "3686 — Phanuwat") so we can still attribute the action.
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_label   VARCHAR(100),
  action        VARCHAR(50)  NOT NULL,
  resource_type VARCHAR(30),
  resource_id   INTEGER,
  status        VARCHAR(10)  NOT NULL DEFAULT 'success'
                CHECK (status IN ('success', 'failure')),
  ip_address    VARCHAR(45),
  user_agent    VARCHAR(500),
  metadata      JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_user         ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action       ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_resource     ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created      ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_metadata_gin ON audit_logs USING GIN (metadata);
