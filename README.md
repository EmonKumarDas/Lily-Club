# Lily Community Center (লিলি কমিউনিটি সেন্টার)

A bilingual (**Bangla + English**) internal booking and club management system for **Lily Community Center**, built with a strict **Day / Night / Full** (`দিন` / `রাত` / `দিন ও রাত`) slot architecture, dual calendar display (**Bangladesh Revised Bengali Calendar + Gregorian Calendar** in `Asia/Dhaka` timezone), and role-based access control.

---

## 1. How to Run

### Prerequisites
- **Node.js** `>= 20.x`
- **npm** `>= 10.x`

### Install & Start
```bash
# 1. Install dependencies
npm install

# 2. Copy the environment template to .env
cp .env.example .env

# 3. Build the frontend bundle
npm run build

# 4. Start the application server (serves API + built frontend on PORT)
npm start
```

### Development & Testing
```bash
# Run the full automated test suite (Parts 1–4)
npm test

# Type-check TypeScript without emitting files
npx tsc --noEmit
```

---

## 2. Environment Variables

All environment variables are validated on startup in `server/config.ts`. If any required variable is missing or invalid (or uses a placeholder secret in production), the server refuses to start with a clear error message.

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | Yes | `development` | Set to `development` or `production`. In `production`, secure cookies are enforced, dev-login is disabled, stack traces are hidden, and placeholder secrets are rejected. |
| `PORT` | No | `3000` | HTTP port the Express server listens on (`1`–`65535`). |
| `PUBLIC_APP_URL` | Yes | `http://localhost:3000` | Full public origin URL used for Google OAuth 2.0 callback redirects and CORS origin validation. |
| `DATABASE_URL` | Yes | `./data/lilycc.db` | Path to the SQLite database file (runs in WAL mode with foreign keys enabled). |
| `SESSION_SECRET` | Yes | — | Cryptographically random secret (`>= 32` characters) used to sign session tokens. Must not contain `"example"`, `"placeholder"`, or `"changeme"` in production. |
| `SESSION_IDLE_TIMEOUT_MINUTES` | No | `30` | Minutes of inactivity before a session expires automatically. |
| `SESSION_ABSOLUTE_TIMEOUT_HOURS` | No | `12` | Maximum lifetime of a session in hours, regardless of activity. |
| `JOIN_RATE_LIMIT_MAX_ATTEMPTS` | No | `5` | Maximum failed room join attempts allowed before temporary lockout. |
| `JOIN_LOCKOUT_MINUTES` | No | `15` | Lockout duration in minutes after exceeding `JOIN_RATE_LIMIT_MAX_ATTEMPTS`. |
| `GOOGLE_CLIENT_ID` | Yes | — | Google OAuth 2.0 Client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | Yes | — | Google OAuth 2.0 Client Secret from Google Cloud Console. |
| `DEV_LOGIN_ENABLED` | No | `false` | Enables `/api/auth/dev-login` for local development and automated E2E tests. Strictly blocked when `APP_ENV=production`. |

---

## 3. How to Create Your First Room

1. **Sign in with Google** on the login screen (or use a Quick Dev Login profile when running locally with `APP_ENV=development` and `DEV_LOGIN_ENABLED=true`).
2. After signing in, you land on the **Room Choice** screen with two options:
   - **Create a New Room**: Enter the club/branch name (e.g., *Lily Community Center*), address, phone number, and default Day/Night slot timings. You automatically become the **Owner** of that room, and a unique **Room ID** (e.g., `LILY-XXXX-XXXX`) is generated.
   - **Join an Existing Room**: Enter a Room ID shared by an Owner or Manager. Your join request enters a **Pending** queue until the Owner or Manager approves it and assigns your role.
3. Once inside a room, you can optionally click **"Load [DEMO] Data"** on the Bookings page to populate realistic sample halls, customers, Day/Night/Full bookings, payments, and expenses, and click **"Clear [DEMO]"** at any time to remove them cleanly.

---

## 4. How Roles Work

Every user's role is scoped **per room** and verified on the server on every API request:

| Role | Bangla | Permissions |
| :--- | :--- | :--- |
| **Owner** (`OWNER`) | মালিক | Full control over the room: manage halls, customers, bookings, payments, refunds, expenses, reports, room settings, member approvals/role changes, and the complete Audit Log. Can transfer ownership. |
| **Manager** (`MANAGER`) | ম্যানেজার | Full operational and financial access: manage halls, customers, bookings (including custom prices below base price), payments, reversals, expenses, reports, and approve/reject join requests for Staff/Viewer. |
| **Staff** (`STAFF`) | স্টাফ | Front-desk booking operations: create and update bookings, manage customers, and record customer payments/money receipts. **Cannot** set a booking price below the hall's base price without Manager approval, **cannot** view revenue/due summary cards, financial reports, or expenses, and **cannot** change room settings. Financial fields are stripped on the server before responses are sent. |
| **Viewer** (`VIEWER`) | দর্শক | Read-only access to the Dashboard, Calendar, Bookings, Halls, and Customers with all financial/revenue figures redacted on the server. Cannot create, edit, or delete any record. |

---

## 5. How the Day / Night / Full Slot System Works

Every booking in Lily Community Center uses one of three slot types:

- **Day (`DAY` / `দিন`)** — Default `8:00 AM – 4:00 PM` (☀️ Sun badge)
- **Night (`NIGHT` / `রাত`)** — Default `6:00 PM – 12:00 AM` (🌙 Moon badge)
- **Full (`FULL` / `দিন ও রাত`)** — Occupies **both** Day and Night on that date (☀️+🌙 Sun+Moon badge)

### Core Slot & Conflict Rules
1. **Independent Day & Night Bookings**: A hall can have one **Day** booking and one **Night** booking on the same date without conflict.
2. **Full Slot Exclusivity**: A **Full** booking locks both the `DAY` and `NIGHT` slots for that hall and date in the `booking_slot_locks` table. It conflicts with any existing Day, Night, or Full booking on that hall and date.
3. **Database-Level Atomic Locking**: Slot locks are enforced inside a SQLite transaction via a unique index on `(hall_id, event_date, locked_slot)` in `booking_slot_locks`. Even if two staff members click Save at the exact same millisecond, double-booking is impossible.
4. **Night Crossing Midnight**: If a room configures the Night slot to end after midnight (e.g., `6:00 PM – 1:00 AM`), the booking still belongs to the date it **started** on, displays `"Ends next day"` with the next day's Bangla and Gregorian dates on receipts and cards, and never falsely conflicts with the next day's Day slot.
5. **Single Occupancy Counting**: In Reports and on the Dashboard, a **Full** booking counts as **1 Day slot + 1 Night slot** when computing Day and Night slot occupancy/free slots, and counts as **1 booking** in total booking counts—never double-counted.
