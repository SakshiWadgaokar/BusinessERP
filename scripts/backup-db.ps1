<#
.SYNOPSIS
  Automated PostgreSQL backup script for Business ERP.
.DESCRIPTION
  Reads DATABASE_URL and PG_BIN_DIR from .env (or environment), creates a compressed
  custom-format pg_dump backup with SHA-256 checksum, and prunes backups older than
  BACKUP_RETENTION_DAYS.
#>
param(
  [string]$EnvFile = "$PSScriptRoot\..\.env",
  [string]$BackupDir = "$PSScriptRoot\..\backups",
  [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

if (Test-Path $EnvFile) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+?)\s*=\s*"?([^"]*)"?\s*$') {
      [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
  }
}

$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl) {
  throw "DATABASE_URL is not set."
}

$pgBin = if ($env:PG_BIN_DIR) { $env:PG_BIN_DIR } else { "C:\Program Files\PostgreSQL\17\bin" }
$pgDump = Join-Path $pgBin "pg_dump.exe"
if (-not (Test-Path $pgDump)) {
  throw "pg_dump.exe not found at $pgDump"
}

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$cleanUrl = $databaseUrl -replace '\?schema=[^&]+', ''
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $BackupDir "business_erp_$timestamp.dump"

Write-Host "Starting PostgreSQL backup to $backupFile ..."
& $pgDump --format=custom --compress=9 --no-owner --no-privileges --file="$backupFile" "$cleanUrl"
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

$hash = (Get-FileHash -Path $backupFile -Algorithm SHA256).Hash
"$hash  $(Split-Path $backupFile -Leaf)" | Out-File -FilePath "$backupFile.sha256" -Encoding ascii

$sizeBytes = (Get-Item $backupFile).Length
Write-Host "Backup complete: $backupFile ($sizeBytes bytes) SHA256=$hash"

# Retention cleanup
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "business_erp_*.dump*" | Where-Object {
  $_.LastWriteTime -lt $cutoff
} | Remove-Item -Force

Write-Host "Retention cleanup complete (kept last $RetentionDays days)."
