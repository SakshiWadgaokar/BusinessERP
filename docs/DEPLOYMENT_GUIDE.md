# Production Deployment Guide

## Option A: 100% Free Deployment on Vercel + Neon PostgreSQL (Recommended for Free Live Use)

Both the **Next.js Web Portal** (`apps/web`) and the **NestJS API** (`apps/api`) are pre-configured for **Vercel Hobby (Free)** using a single GitHub repository (`SakshiWadgaokar/BusinessERP`), paired with a free **Neon** (or **Supabase**) PostgreSQL database.

### Step 1 — Create Free PostgreSQL Database (2 mins)
1. Create a free PostgreSQL database at **[neon.tech](https://neon.tech)** (or **[supabase.com](https://supabase.com)**) — select region **Mumbai (`ap-south-1`)** or **Singapore (`ap-southeast-1`)**.
2. Copy the PostgreSQL connection string (`DATABASE_URL`, ending in `?sslmode=require`).
3. Run schema migration and initial seed once from your PC against the cloud database:
   ```powershell
   $env:DATABASE_URL="postgresql://...your-neon-url..."
   npm.cmd run prisma:migrate:deploy
   npm.cmd run prisma:seed
   npx.cmd tsx prisma/seed-catalog.ts
   npx.cmd tsx prisma/seed-portal-users.ts
   ```

### Step 2 — Deploy API on Vercel (Free)
1. Open **[vercel.com/new](https://vercel.com/new)** → Import **`SakshiWadgaokar/BusinessERP`**.
2. Set **Project Name** to `business-erp-api` and **Root Directory** to `apps/api`.
3. Keep Framework Preset as **Other** (Vercel automatically reads `apps/api/vercel.json`).
4. Add Environment Variables:
   - `NODE_ENV` = `production`
   - `DATABASE_URL` = `<your Neon/Supabase PostgreSQL URL>`
   - `COOKIE_SECURE` = `true`
   - `CORS_ORIGIN` = `*` (or your web URL once deployed, e.g. `https://business-erp-web.vercel.app`)
   - `STORAGE_DRIVER` = `local_private` (PDF bills/receipts/challans auto-regenerate on-the-fly from PostgreSQL; optionally upgrade to S3/R2 later)
   - `JWT_ACCESS_SECRET` = `<any random 32+ char string>`
   - `JWT_REFRESH_SECRET` = `<any different random 32+ char string>`
   - `CSRF_SECRET` = `<any different random 32+ char string>`
   - `STORAGE_SIGNED_URL_SECRET` = `<any different random 32+ char string>`
5. Click **Deploy** and copy the API URL (e.g., `https://business-erp-api.vercel.app`). Verify `https://business-erp-api.vercel.app/api/v1/health/ready` returns `{"status":"ready","database":"up"}`.

### Step 3 — Deploy Web Portal on Vercel (Free)
1. Open **[vercel.com/new](https://vercel.com/new)** → Import **`SakshiWadgaokar/BusinessERP`** again.
2. Set **Project Name** to `business-erp-web` and **Root Directory** to `apps/web`.
3. Framework Preset will auto-detect **Next.js** (reads `apps/web/vercel.json`).
4. Add Environment Variable:
   - `INTERNAL_API_URL` = `https://<your-api-project>.vercel.app` (no trailing slash)
5. Click **Deploy**! Your live free HTTPS ERP URL (`https://<your-web-project>.vercel.app`) will be ready for Admin, Dealer, Employee, Accountant, and Inventory logins.

---

## Option B: Dedicated VPS / Cloud Production Topology (India Region)
- **Region:** AWS `ap-south-1` (Mumbai) or DigitalOcean `blr1` (Bengaluru) — confirm final residency with client.
- **Database:** Managed PostgreSQL 17 with TLS (`sslmode=require`), automated daily snapshots, and private VPC access only.
- **Object Storage:** Private S3-compatible bucket (AWS S3 / Cloudflare R2 / MinIO) with Block Public Access enabled and AES-256 encryption.
- **Application Hosting:** Separate `development`, `staging`, and `production` environments behind HTTPS/TLS reverse proxy (Nginx / ALB / Caddy).

## Environment Configuration Checklist
1. Set `NODE_ENV=production` and `COOKIE_SECURE=true`.
2. Generate unique 64-byte hex secrets for `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, and `STORAGE_SIGNED_URL_SECRET`.
3. Set `STORAGE_DRIVER=s3` and configure `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (or IAM role).
4. Set `CORS_ORIGIN` to the exact HTTPS frontend domain.

## Controlled Release Procedure
```bash
npm ci
npm run prisma:generate
npm run prisma:migrate:deploy
npm run build
```
Start API (`npm --workspace=@erp/api run start`) and Web (`npm --workspace=@erp/web run start`) under a process supervisor (PM2 / systemd / container orchestrator) and monitor `GET /api/v1/health/ready`.
