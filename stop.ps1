# RevPilot dev launcher - stops backend (:8000) and frontend (:5173) processes.
# Compatible with Windows PowerShell 5.1+.
$ErrorActionPreference = "SilentlyContinue"

function Stop-PortProcess([int]$Port, [string]$Label) {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "$Label : nothing listening on :$Port" -ForegroundColor Yellow
        return
    }
    $pids = @($conns | Select-Object -ExpandProperty OwningProcess -Unique)
    # Expand to child processes (npm -> node/esbuild trees) before killing
    $all = New-Object System.Collections.Generic.HashSet[int]
    $queue = New-Object System.Collections.Queue
    foreach ($procId in $pids) { [void]$all.Add($procId); $queue.Enqueue($procId) }
    while ($queue.Count -gt 0) {
        $parent = $queue.Dequeue()
        Get-CimInstance Win32_Process -Filter "ParentProcessId = $parent" | ForEach-Object {
            if ($all.Add($_.ProcessId)) { $queue.Enqueue($_.ProcessId) }
        }
    }
    foreach ($procId in $all) {
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
    if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "$Label : FAILED to stop on :$Port" -ForegroundColor Red
    } else {
        Write-Host "$Label : stopped ($($all.Count) process(es))" -ForegroundColor Green
    }
}

Stop-PortProcess 8000 "backend"
Stop-PortProcess 5173 "frontend"
