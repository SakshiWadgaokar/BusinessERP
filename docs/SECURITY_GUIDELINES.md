# Security Guidelines & Implemented Controls

## 1. Authentication & Password Security
- Passwords are hashed using **Argon2id** (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 1`) in `apps/api/src/modules/auth/auth.service.ts`.
- Strong password policy enforced via shared Zod schema (`strongPasswordSchema`): minimum 10 characters with uppercase, lowercase, number, and special character.
- **Brute-Force Protection:** Failed logins increment `failed_login_attempts`; reaching `AUTH_LOCKOUT_MAX_ATTEMPTS` (default 5) locks the account for `AUTH_LOCKOUT_MINUTES` (default 15) and records `AUTH_ACCOUNT_LOCKED` in `audit_logs`.
- **Rate Limiting:** Global NestJS Throttler plus strict limits on `/auth/login`, `/auth/forgot-password`, and `/auth/reset-password`.

## 2. Session Management & CSRF
- Short-lived JWT Access Tokens (default `15m`) kept in memory on the frontend (never in `localStorage`).
- Rotating Refresh Tokens stored as SHA-256 hashes in `user_sessions` and transmitted exclusively via `HttpOnly`, `SameSite=Lax` (`Secure` in HTTPS environments) cookies.
- Refresh endpoint validates double-submit `X-CSRF-Token` header against the CSRF cookie.
- Deactivating/suspending a user or changing/resetting a password immediately revokes all active `user_sessions`.

## 3. Server-Side RBAC & Entity Isolation
- Global `JwtAuthGuard` verifies token signature, live session status, live user status, and active dealer status on every request.
- Global `PermissionsGuard` enforces `@RequirePermissions(...)` against effective permissions (`RolePermission` + `UserPermissionOverride`).
- Dealer routes enforce server-side `dealerId` scoping; Employee routes enforce assigned Job Card scoping.

## 4. Document Storage Security
- Private S3-compatible object storage (`@aws-sdk/client-s3`) with AES-256 server-side encryption and short-lived presigned URLs (`STORAGE_SIGNED_URL_TTL_SECONDS`, default 300s).
- Upload MIME type allowlist (PDF, PNG, JPEG, WebP, XLSX, CSV) and 15 MB size cap enforced server-side.
- Local development fallback (`local_private`) stores files outside any static web root and streams only after HMAC-SHA256 expiry + signature verification.

## 5. Secrets, Error Handling & Audit Logging
- All secrets validated at startup via `apps/api/src/common/config/env.ts`; zero hardcoded production credentials.
- `GlobalExceptionFilter` masks internal stack traces and Prisma error details from HTTP clients.
- `AuditLog` captures actor, action, entity, before/after state, IP address, user agent, and timestamp with no update/delete endpoints exposed.
