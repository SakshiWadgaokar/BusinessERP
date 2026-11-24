# Backup & Disaster Recovery Procedure

## Automated Daily Backup
Script: `scripts/backup-db.ps1`
- Runs compressed PostgreSQL custom-format dump (`pg_dump --format=custom --compress=9`).
- Generates a `.sha256` integrity checksum file alongside every dump.
- Retains backups for `BACKUP_RETENTION_DAYS` (default 30 days) and prunes expired dumps.
- Schedule via Windows Task Scheduler / cron daily at 02:00 IST and sync the `backups/` directory to an isolated offsite S3 bucket with versioning enabled.

## Restore Verification Drill (Mandatory Scenario #25)
Script: `scripts/restore-verify.ps1`
1. Verifies the `.sha256` checksum of the latest `.dump` file.
2. Creates a clean temporary PostgreSQL database (`business_erp_restore_verify_<timestamp>`).
3. Restores the dump using `pg_restore --no-owner --no-privileges`.
4. Executes SQL integrity queries verifying core tables (`users`, `roles`, `audit_logs`) and row counts.
5. Drops the temporary verification database cleanly.

## Production Recovery Procedure
1. Provision a clean PostgreSQL 17 target database.
2. Verify checksum of chosen `.dump` file.
3. Restore via `pg_restore --clean --if-exists --no-owner --no-privileges -d <target_db> <backup.dump>`.
4. Verify `/api/v1/health/ready`, latest `audit_logs`, and ledger balances before re-opening user traffic.
