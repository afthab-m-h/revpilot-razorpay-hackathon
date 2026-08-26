# RevPilot development launcher - starts backend (:8000) + frontend (:5173) and opens the app.
# Paths are derived from this script's location; no machine-specific paths.
# Compatible with Windows PowerShell 5.1+.
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }
$backendDir  = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$venvPython  = Join-Path $backendDir ".venv\Scripts\python.exe"
$logDir      = Join-Path $root "logs"

if (-not (Test-Path $venvPython)) {
    Write-Error "Backend venv not found at $venvPython - create it first: python -m venv .venv, then pip install -r requirements.txt"
}
if (-not (Test-Path (Join-Path $frontendDir "package.json"))) {
    Write-Error "Frontend not found at $frontendDir"
}

function Test-PortInUse([int]$Port) {
    return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

# --- Backend ---------------------------------------------------------------
if (Test-PortInUse 8000) {
    Write-Host "Backend already running on :8000 - skipping" -ForegroundColor Yellow
} else {
    Write-Host "Starting backend (uvicorn) on :8000 ..." -ForegroundColor Cyan
    Start-Process -FilePath $venvPython `
        -ArgumentList "-m", "uvicorn", "app.main:app", "--port", "8000" `
        -WorkingDirectory $backendDir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "backend.out.log") `
        -RedirectStandardError  (Join-Path $logDir "backend.err.log")
}

# --- Frontend --------------------------------------------------------------
if (Test-PortInUse 5173) {
    Write-Host "Frontend already running on :5173 - skipping" -ForegroundColor Yellow
} else {
    Write-Host "Starting frontend (vite dev) on :5173 ..." -ForegroundColor Cyan
    $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npmCmd) { $npmCmd = Get-Command npm -ErrorAction Stop }
    Start-Process -FilePath $npmCmd.Source `
        -ArgumentList "run", "dev" `
        -WorkingDirectory $frontendDir -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logDir "frontend.out.log") `
        -RedirectStandardError  (Join-Path $logDir "frontend.err.log")
}

# --- Wait & verify ---------------------------------------------------------
# NOTE: probe explicit IPs, never bare 'localhost' - Vite may bind IPv6 ::1
# and uvicorn binds 127.0.0.1, so each service is checked on BOTH stacks.
# Total wait is bounded so this script can NEVER hang.
$backendUrls  = @("http://127.0.0.1:8000/health")
$frontendUrls = @("http://127.0.0.1:5173/", "http://[::1]:5173/")
$deadline     = (Get-Date).AddSeconds(60)
$backendUp = $false; $frontendUp = $false

while ((Get-Date) -lt $deadline -and (-not ($backendUp -and $frontendUp))) {
    if (-not $backendUp) {
        foreach ($u in $backendUrls) {
            if (-not $backendUp) {
                try { Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2 | Out-Null; $backendUp = $true } catch {}
            }
        }
    }
    if (-not $frontendUp) {
        foreach ($u in $frontendUrls) {
            if (-not $frontendUp) {
                try { Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 2 | Out-Null; $frontendUp = $true } catch {}
            }
        }
    }
    if ($backendUp -and $frontendUp) { break }
    Start-Sleep -Milliseconds 300
}

Write-Host ""
if ($backendUp)  { Write-Host "  backend  : http://127.0.0.1:8000  (health OK)" -ForegroundColor Green }
else             { Write-Host "  backend  : NOT responding (waited 60s)" -ForegroundColor Red }
if ($frontendUp) { Write-Host "  frontend : http://localhost:5173" -ForegroundColor Green }
else             { Write-Host "  frontend : NOT responding (waited 60s)" -ForegroundColor Red }

# On failure, surface the relevant log tail immediately instead of hanging.
if (-not $backendUp) {
    $errLog = Join-Path $logDir "backend.err.log"
    if (Test-Path $errLog) {
        Write-Host "`n  ---- backend.err.log (last 8 lines) ----" -ForegroundColor DarkGray
        Get-Content $errLog -Tail 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
    $outLog = Join-Path $logDir "backend.out.log"
    if ((Test-Path $outLog) -and ((Get-Item $outLog).Length -gt 0)) {
        Write-Host "  ---- backend.out.log (last 4 lines) ----" -ForegroundColor DarkGray
        Get-Content $outLog -Tail 4 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
}
if (-not $frontendUp) {
    $fErrLog = Join-Path $logDir "frontend.err.log"
    if (Test-Path $fErrLog) {
        Write-Host "`n  ---- frontend.err.log (last 8 lines) ----" -ForegroundColor DarkGray
        Get-Content $fErrLog -Tail 8 | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
}

# Even if our probe failed, open the app only when the port is genuinely listening.
if (Test-PortInUse 8000 -or $backendUp) { } # backend state reported above

if ($frontendUp) {
    Write-Host ""
    Write-Host "Opening browser..." -ForegroundColor Cyan
    Start-Process "http://localhost:5173"
} elseif (Test-PortInUse 5173) {
    Write-Host ""
    Write-Host "Opening browser (frontend port is listening)..." -ForegroundColor Cyan
    Start-Process "http://localhost:5173"
}

Write-Host "`nLogs: $logDir"
