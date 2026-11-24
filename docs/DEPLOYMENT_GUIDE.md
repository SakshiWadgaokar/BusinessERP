# Production Deployment Guide

## Recommended Production Topology (India Region)
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
