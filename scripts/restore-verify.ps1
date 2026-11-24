<#
.SYNOPSIS
  Automated PostgreSQL backup restore verification drill (Mandatory Scenario #25).
.DESCRIPTION
  Verifies the SHA-256 checksum of the latest backup dump, restores it into a clean
  temporary PostgreSQL database, verifies core table accessibility and row counts,
  and drops the temporary database on completion.
#>
param(
  [string]$EnvFile = "$PSScriptRoot\..\.env",
  [string]$BackupFile = ""
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
if (-not $databaseUrl) { throw "DATABASE_URL is not set." }

$pgBin = if ($env:PG_BIN_DIR) { $env:PG_BIN_DIR } else { "C:\Program Files\PostgreSQL\17\bin" }
$psql = Join-Path $pgBin "psql.exe"
$pgRestore = Join-Path $pgBin "pg_restore.exe"

if (-not $BackupFile) {
  $latest = Get-ChildItem -Path "$PSScriptRoot\..\backups" -Filter "business_erp_*.dump" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $latest) { throw "No backup .dump files found in backups directory." }
  $BackupFile = $latest.FullName
}

$checksumFile = "$BackupFile.sha256"
if (Test-Path $checksumFile) {
  $expected = (Get-Content $checksumFile).Split(" ")[0].Trim()
  $actual = (Get-FileHash -Path $BackupFile -Algorithm SHA256).Hash
  if ($expected -ne $actual) {
    throw "Backup checksum mismatch! Expected $expected, got $actual"
  }
  Write-Host "SHA-256 checksum verified: $actual"
}

$uri = [System.Uri]($databaseUrl -replace '\?schema=[^&]+', '')
$userInfo = $uri.UserInfo.Split(':')
$env:PGPASSWORD = [System.Uri]::UnescapeDataString($userInfo[1])
$pgUser = [System.Uri]::UnescapeDataString($userInfo[0])
$pgHost = $uri.Host
$pgPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$verifyDb = "business_erp_restore_verify_$(Get-Date -Format 'yyyyMMddHHmmss')"

try {
  Write-Host "Creating temporary verification database: $verifyDb"
  & $psql -h $pgHost -p $pgPort -U $pgUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $verifyDb;"
  if ($LASTEXITCODE -ne 0) { throw "Failed to create verification database." }

  Write-Host "Restoring $BackupFile into $verifyDb ..."
  & $pgRestore -h $pgHost -p $pgPort -U $pgUser -d $verifyDb --no-owner --no-privileges "$BackupFile"
  if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE" }

  Write-Host "Running integrity check queries on restored database..."
  & $psql -h $pgHost -p $pgPort -U $pgUser -d $verifyDb -v ON_ERROR_STOP=1 -c "SELECT (SELECT count(*) FROM users) AS users_count, (SELECT count(*) FROM roles) AS roles_count, (SELECT count(*) FROM audit_logs) AS audit_logs_count;"
  if ($LASTEXITCODE -ne 0) { throw "Verification query failed." }

  Write-Host "RESTORE VERIFICATION PASSED SUCCESSFULLY."
} finally {
  Write-Host "Cleaning up temporary database: $verifyDb"
  & $psql -h $pgHost -p $pgPort -U $pgUser -d postgres -c "DROP DATABASE IF EXISTS $verifyDb WITH (FORCE);" | Out-Null
  $env:PGPASSWORD = $null
}
