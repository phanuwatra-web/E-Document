# DocSign

ระบบลงนามเอกสารดิจิทัลภายในองค์กร — Admin อัปโหลด PDF, มอบหมายให้ทั้งแผนก, พนักงานเซ็นออนไลน์ (click หรือวาดด้วยเมาส์/นิ้ว), แล้วลายเซ็นถูกฝังลงไฟล์ PDF จริง ใช้งาน

## Stack

| Layer    | Tech                                                              |
| -------- | ----------------------------------------------------------------- |
| Frontend | Next.js 14 (App Router), Tailwind CSS, react-pdf, signature_pad   |
| Backend  | Node.js, Express, JWT, bcrypt, multer, helmet, express-rate-limit |
| Database | PostgreSQL                                                        |
| Email    | Nodemailer (Outlook / Office 365 SMTP)                            |
| PDF      | pdf-lib (signature embedding)                                     |

## Folder layout

```
docsign/
├── database/
│   ├── schema.sql               schema (5 tables)
│   └── seed.sql                 default departments + admin
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│       ├── server.js
│       ├── config/              database, email
│       ├── middleware/          auth, upload, errorHandler
│       ├── controllers/         auth, user, document, signature
│       ├── services/            email.service, pdf.service
│       └── routes/              auth, user, document, signature
└── frontend/
    ├── package.json
    ├── .env.local.example
    ├── app/
    │   ├── login/
    │   ├── dashboard/
    │   │   └── document/[id]/
    │   └── admin/
    │       ├── upload/
    │       └── users/
    ├── components/              Navbar, PDFViewer, SignatureModal
    └── lib/api.js
```

## Tests

```bash
cd backend
cp .env.test.example .env.test       # edit DATABASE_URL to point at docsign_test
createdb docsign_test                # one-time
npm install
npm test                             # full integration suite
npm run test:coverage                # + coverage report in backend/coverage/
```

CI: see `.github/workflows/test.yml` — spins up a Postgres service and runs the same `npm test`.

## Quick start with Docker

```bash
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD and JWT_SECRET (REQUIRED)

docker compose up -d --build
docker compose ps                    # check health
docker compose logs -f backend       # tail structured JSON logs
```

Open http://localhost:3000 — login with seeded admin (run seed inside container or against the DB).

| Stop                              | Action                          |
| --------------------------------- | ------------------------------- |
| `docker compose down`             | Stop, keep DB & uploads volumes |
| `docker compose down -v`          | **Destroy** volumes too         |
| `docker compose restart backend`  | Restart only backend            |
| `docker compose build --no-cache` | Force a clean image rebuild     |

For plain-HTTP local testing (no TLS), copy `docker-compose.override.yml.example` to `docker-compose.override.yml` to switch backend to `NODE_ENV=development` (Secure cookies disabled).

## Setup (without Docker)

### 1. Database

```bash
createdb docsign
psql -d docsign -f database/schema.sql
psql -d docsign -f database/seed.sql
```

Default credentials after seeding:

- **Admin** — Employee ID `3619`, password `ChangeMe!Admin2026`
- **Users** — Employee IDs `3686`–`3693`, password `ChangeMe!User2026`

To override the seeded passwords:

```bash
SEED_ADMIN_PASSWORD='YourStrongAdminP@ss' SEED_USER_PASSWORD='YourStrongUserP@ss' \
  node database/seed.js
```

**เปลี่ยนรหัสผ่านที่ `/account/change-password` ทันทีหลังล็อกอินครั้งแรก** —
default passwords อยู่ใน source repo, ใครก็เห็น

### 2. Backend

```bash
cd backend
cp .env.example .env       # แล้วใส่ DATABASE_URL, JWT_SECRET, SMTP_USER, SMTP_PASS
npm install
npm run dev                 # http://localhost:5000
```

JWT_SECRET ต้องยาวอย่างน้อย 32 ตัวอักษร (ใช้ `openssl rand -hex 32`)

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                 # http://localhost:3000
```

## API endpoints

| Method | Path                                   | Auth  | Description                              |
| ------ | -------------------------------------- | ----- | ---------------------------------------- |
| GET    | `/health`                              | —     | Liveness probe                           |
| GET    | `/readiness`                           | —     | Readiness probe (DB + 503 on shutdown)   |
| GET    | `/api/auth/csrf-token`                 | —     | Bootstrap CSRF cookie + token            |
| POST   | `/api/auth/login`                      | —     | Login → sets httpOnly auth cookie        |
| GET    | `/api/auth/me`                         | user  | Current user info                        |
| POST   | `/api/auth/logout`                     | user  | Clear auth cookies                       |
| POST   | `/api/auth/change-password`            | user  | Change own password (force re-login)     |
| GET    | `/api/users/departments`               | user  | List departments                         |
| GET    | `/api/users`                           | admin | List all users                           |
| POST   | `/api/users`                           | admin | Create user (validates password policy)  |
| PATCH  | `/api/users/:id/toggle`                | admin | Activate / deactivate user               |
| DELETE | `/api/users/:id`                       | admin | Hard-delete user (refuses if has docs)   |
| GET    | `/api/documents`                       | user  | List my documents (filtered by role)     |
| GET    | `/api/documents/:id`                   | user  | Document detail + signers                |
| GET    | `/api/documents/:id/file[?download=1]` | user  | Stream PDF (signatures embedded)         |
| GET    | `/api/documents/:id/status`            | admin | Per-user signing status                  |
| POST   | `/api/documents`                       | admin | Upload + auto-assign to dept (multipart) |
| DELETE | `/api/documents/:id`                   | admin | Delete document + cascade                |
| POST   | `/api/signatures`                      | user  | Sign document                            |
| DELETE | `/api/signatures/me/:documentId`       | user  | Unsign — reset to pending                |
| PATCH  | `/api/signatures/me/:documentId`       | user  | Update signature position                |
| GET    | `/api/signatures/me/:documentId`       | user  | Get my own signature data                |
| GET    | `/api/signatures/document/:id`         | admin | Signatures of one document               |
| GET    | `/api/audit-logs`                      | admin | Filter audit log (action, user, date)    |

### Response shape conventions

- **Success (write endpoints)**: `{ ok: true, message?, ...domainData }`
- **Success (read endpoints)**: object or array of objects directly
- **Error**: `{ error: 'human message', errors?: [...for validation], requestId }`

State-changing requests (POST/PUT/PATCH/DELETE) require `X-CSRF-Token` header
matching the `csrf_token` cookie. GET / HEAD / OPTIONS are exempt.

## Architecture

```
┌─────────────┐  HTTPS  ┌────────────┐  Docker    ┌───────────────────┐
│  Browser    │────────►│   nginx    │   net      │  Express + pino   │──┐
│ Next.js SPA │         │   /TLS     │───────────►│  /health, /api/*  │  │
└─────────────┘         └────────────┘            │  CSRF + JWT cookie│  │
                                                  │  audit + RBAC     │  │
                                                  └───────────────────┘  │
                                                          │              │
                                                          ▼              ▼
                                                  ┌───────────────┐  ┌─────────┐
                                                  │ PostgreSQL 16 │  │ uploads │
                                                  │ (data + audit)│  │ volume  │
                                                  └───────────────┘  └─────────┘
```

**Security stack:**

- httpOnly + SameSite=Lax + Secure cookie for JWT (XSS-safe)
- Double-submit CSRF with constant-time compare
- bcrypt cost 12, password policy enforced (8+ chars, 4 classes, no common words)
- Rate limit: 200/15min/api, 15/15min login, 5/15min change-password
- Audit log for every security-relevant action — append-only, includes reqId
- helmet headers, CORS exact origin, parameterised SQL everywhere

**Operability:**

- Structured logs (pino) → JSON to stdout → Docker / Loki / ELK
- Request correlation: `X-Request-Id` header round-trip + reqId in audit metadata
- `/health` (liveness) + `/readiness` (drain-aware, 503 during shutdown)
- Graceful shutdown: SIGTERM → 503 → drain HTTP → close DB → exit (bounded 20s)
- 38+ integration tests (auth, RBAC, CSRF, audit, sign flow, password policy)

## How signing works

1. Admin uploads PDF → backend creates `documents` + `document_assignments` rows for everyone in the department (transaction)
2. Email service notifies all assignees (BCC)
3. User opens document → react-pdf renders → click or draw signature → adjust position
4. POST `/api/signatures` inserts signature + flips assignment to `signed` (transaction + audit)
5. On every read of `/documents/:id/file`, pdf-lib embeds visible signatures on-the-fly into the PDF stream

## Production checklist

**Required before go-live:**

- [ ] `JWT_SECRET` ≥ 32 chars (server REFUSES to start otherwise in `NODE_ENV=production`)
- [ ] All seeded users changed their default password via `/account/change-password`
- [ ] `NODE_ENV=production`
- [ ] HTTPS reverse proxy (Caddy / nginx / Traefik) in front; matching `TRUST_PROXY` hop count
- [ ] `.env` files NOT committed to git (`.gitignore` provided)
- [ ] PostgreSQL daily `pg_dump` + `backend/uploads/` snapshot to off-host storage
- [ ] Schedule `npm run audit:cleanup` daily via cron / k8s CronJob
- [ ] Backup restore test verified at least once
- [ ] Privacy notice / PDPA consent page reviewed by Legal/HR
- [ ] DPO designated, RoPA documented

**Recommended:**

- [ ] Log shipping (Loki/Filebeat → ELK/CloudWatch)
- [ ] Alert on `level=error` rate spike
- [ ] Alert on `level=warn AND msg='audit log write failed'` (audit pipeline broken)
- [ ] Sentry / equivalent for frontend crash reports

## Known limitations (by design — see audit report)

- Visible-stamp signatures only (not crypto-bound PAdES/PKCS#7) — suitable for low-risk internal documents per Electronic Transactions Act §9, NOT §26 secured signatures
- No PDF hash stored — file integrity provable only at application layer
- Single-region deployment (no HA)
- No pagination on list endpoints yet (acceptable < 1000 rows)
- Email failures dropped after one attempt (no retry queue)
- No MFA (acceptable for internal-network access; add for external-facing)
