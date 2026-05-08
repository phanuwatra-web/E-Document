-- DocSign — initial seed data
-- Run AFTER schema.sql:  psql $DATABASE_URL -f database/seed.sql

-- Default departments
INSERT INTO departments (name, description) VALUES
  ('IT',          'Information Technology'),
  ('HR',          'Human Resources'),
  ('Finance',     'Finance & Accounting'),
  ('Operations',  'Operations & Logistics')
ON CONFLICT (name) DO NOTHING;

-- Initial admin user
--   Employee ID:  ADMIN-001
--   Password:     ChangeMe!2026   (bcrypt hash, cost 12)
-- IMPORTANT: change this password immediately after first login.
INSERT INTO users (employee_id, name, email, password_hash, role, department_id)
VALUES (
  'ADMIN-001',
  'System Administrator',
  'admin@company.local',
  '$2b$12$rHV6T2dzYqXxUEm1m8bKaeXq7n3cUq7WJ.tQk2W1f8xXz4rXqhjQa',
  'admin',
  (SELECT id FROM departments WHERE name = 'IT')
)
ON CONFLICT (employee_id) DO NOTHING;

-- If you want to generate a fresh hash yourself:
--   node -e "console.log(require('bcrypt').hashSync('YourPassword', 12))"
-- then UPDATE users SET password_hash = '<new-hash>' WHERE employee_id = 'ADMIN-001';
