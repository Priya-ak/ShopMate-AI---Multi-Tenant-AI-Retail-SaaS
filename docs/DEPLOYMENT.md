# Deploying ShopMate AI on Vercel + Supabase

Vercel hosts the Vite front-end as static files and the Express API as **one serverless function**
(`api/index.ts`, wired up by `vercel.json`). Serverless functions have no persistent disk and share no memory,
so production uses **PostgreSQL (Supabase)** and **stateless signed session tokens**. Locally (and in AI Studio)
the same code still runs on a SQLite file with no setup.

```text
Browser ──> Vercel static (dist/)            /, /superadmin (SPA)
        └─> Vercel function api/index.ts     /api/*  (Express app from server/app.ts)
                 └─> Supabase Postgres       DATABASE_URL (server-side only)
                 └─> Gemini API (optional)   GEMINI_API_KEY
                 └─> Google ID-token verify  GOOGLE_CLIENT_ID (optional)
```

## 1. Database (Supabase)

1. In Supabase open **Project Settings → Database → Connection string** and copy the **Transaction pooler**
   string (port `6543`). Replace `[YOUR-PASSWORD]` with your database password.
2. Add it to Vercel as `DATABASE_URL` (Production **and** Preview). It is a secret: never put it in front-end code.
3. Nothing else to do: on the first request the app creates/updates its tables (versioned, guarded by an advisory
   lock so concurrent cold starts are safe) and enables **Row Level Security** on every table. The API connects with
   the database owner role, while the Supabase `anon`/`authenticated` roles (the public Data API) get **no access**.

> Why it was failing before: Vercel only served the static build, so `/api/auth/register` and
> `/api/auth/demo-login` returned 404. There was no backend function and the old backend used a local SQLite file and an
> in-memory session list, neither of which exists on serverless.

## 2. Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **Yes on Vercel** | Supabase Postgres (transaction pooler) connection string |
| `SESSION_SECRET` | **Yes** | 32+ random characters used to sign session tokens (`openssl rand -hex 32`). Changing it signs everyone out |
| `GOOGLE_CLIENT_ID` | For Google sign-in | OAuth *Web application* client ID (public value, no client secret needed) |
| `SUPERADMIN_EMAIL` | For the admin portal | Email of the platform owner. Account is created at startup |
| `SUPERADMIN_PASSWORD` | Optional | 8+ chars. If omitted, the owner can only sign in to the portal with Google |
| `GEMINI_API_KEY` | Optional | Enables Gemini answers; without it the built-in engines answer |

Check `GET /api/health` after deploying: it reports the database driver and which features are configured
(it never returns secrets).

## 3. Google sign-in

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. **Authorized JavaScript origins**: your Vercel URL (e.g. `https://your-app.vercel.app`), any custom domain and
   `http://localhost:3000` for local work. No redirect URI is needed (Google Identity Services popup).
3. Set `GOOGLE_CLIENT_ID` in Vercel and redeploy.

How it works: the browser obtains a Google ID token; `POST /api/auth/google` verifies it with Google
(audience = your client ID, issuer, expiry, verified email) and only then signs the user in. Sign-in never creates a
store by itself - registering with Google requires a store name and phone first. An existing email/password account
is linked to Google the first time the same verified email signs in with Google.

## 4. Super Admin portal (`/superadmin`)

A separate screen with its own sign-in and its own session (`shopmate_sa_token`), independent from the store app.
It shows who is signing in (logins today/7/30 days, unique users, active now, failed attempts, method breakdown),
registrations, the user list, **buyers across all stores**, businesses with their owners and revenue, and orders. Tables
are searchable and filterable and can be exported to CSV.

* Access is limited to a real super admin (`SUPERADMIN_EMAIL` account). Demo personas, store owners and customers
  receive `403` from every `/api/superadmin/*` endpoint.
* Demo/sandbox activity is hidden by default (toggle **Include demo data**).
* Every sign-in (successful or failed, password / Google / demo / registration) is recorded in `login_events`
  with method, IP and user agent. No passwords or tokens are stored there.

## 5. Demo personas

"One-Click Demo Personas" create a sandbox on demand (`POST /api/auth/demo-login`, no credentials):
a shared demo store (`biz_demo_store_001`) with sample products, plus Owner, Employee and Customer
accounts flagged `is_demo`. There is no demo admin; the platform operator uses the private `/superadmin` portal only.

## 6. Deploy checklist

- [ ] `DATABASE_URL`, `SESSION_SECRET` set for Production (and Preview)
- [ ] `npm install` run once locally so `package-lock.json`/`bun.lock` pick up the new `pg` dependency
- [ ] `GOOGLE_CLIENT_ID` set and your Vercel domain added as an authorized origin (optional)
- [ ] `SUPERADMIN_EMAIL` (+ `SUPERADMIN_PASSWORD`) set; sign in at `/superadmin`
- [ ] `GET /api/health` shows `"database": "PostgreSQL"`
- [ ] Register a test business, check the Login activity tab in `/superadmin`

## 7. Known limitations (MVP)

* Rate limiting is per serverless instance (best-effort). For hard limits put Vercel Firewall rules or a shared
  store (Redis/Upstash) in front of `/api/auth/*`.
* Sessions are stateless 7-day tokens: logging out removes the token from the browser but cannot revoke a stolen one
  before expiry (rotate `SESSION_SECRET` to revoke all).
* Password reset has no email delivery configured: in production the reset token is not returned by the API, so a mail
  provider must be added before enabling "Forgot password" for real users.
