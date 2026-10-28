$ErrorActionPreference = "Stop"

$exePath = Join-Path $PSScriptRoot "bin\Release\net8.0\PlcApiServer.exe"
$workingDirectory = $PSScriptRoot
$healthUrl = "http://127.0.0.1:5050/health"
$logPath = Join-Path $PSScriptRoot "watchdog.log"
$checkIntervalSeconds = 30
$failedChecksBeforeRestart = 2
$unhealthyChecks = 0
$status = "Starting"
$script:notifyIcon = $null
$script:checkTimer = $null

function Write-WatchdogLog {
    param([string]$Message)
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Set-WatchdogStatus {
    param(
        [string]$NewStatus,
        [string]$Tooltip,
        [System.Drawing.Icon]$Icon
    )

    if ($script:status -ne $NewStatus) {
        Write-WatchdogLog $NewStatus
        $script:status = $NewStatus
    }

    if ($script:notifyIcon) {
        $script:notifyIcon.Text = $Tooltip
        $script:notifyIcon.Icon = $Icon
    }
}

function Get-ServerProcesses {
    $processes = Get-CimInstance Win32_Process -Filter "name='PlcApiServer.exe'" -ErrorAction Stop
    return @($processes | Where-Object { $_.ExecutablePath -ieq $exePath })
}

function Test-ServerHealth {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -TimeoutSec 5 -UseBasicParsing
        return [int]$response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Start-Server {
    if (-not (Test-Path -LiteralPath $exePath)) {
        Write-WatchdogLog "ERROR executable not found: $exePath"
        return
    }

    $process = Start-Process -FilePath $exePath -WorkingDirectory $workingDirectory -WindowStyle Hidden -PassThru
    Write-WatchdogLog "Started PlcApiServer.exe (PID=$($process.Id))"
}

function Restart-Server {
    $processes = @(Get-ServerProcesses)
    foreach ($process in $processes) {
        Write-WatchdogLog "Stopping PlcApiServer.exe (PID=$($process.ProcessId))"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }

    Start-Sleep -Seconds 2
    Start-Server
    $script:unhealthyChecks = 0
}

function Invoke-WatchdogCheck {
    try {
        $processes = @(Get-ServerProcesses)
        if (Test-ServerHealth) {
            $script:unhealthyChecks = 0
            Set-WatchdogStatus "Healthy" "PLC API 정상 | 워치독 감시 중" ([System.Drawing.SystemIcons]::Information)
        }
        elseif ($processes.Count -eq 0) {
            Set-WatchdogStatus "Starting" "PLC API 시작 중 | 워치독 감시 중" ([System.Drawing.SystemIcons]::Warning)
            Write-WatchdogLog "Server process is not running; starting it"
            Start-Server
        }
        else {
            $script:unhealthyChecks++
            if ($script:unhealthyChecks -ge $failedChecksBeforeRestart) {
                Set-WatchdogStatus "Restarting" "PLC API 재시작 중 | 워치독 감시 중" ([System.Drawing.SystemIcons]::Error)
                Write-WatchdogLog "Health check failed $($script:unhealthyChecks) times; restarting server"
                Restart-Server
            }
            else {
                Set-WatchdogStatus "Unhealthy" "PLC API 응답 없음 | 재확인 중" ([System.Drawing.SystemIcons]::Warning)
            }
        }
    }
    catch {
        Set-WatchdogStatus "WatchdogError" "워치독 오류 | 로그 확인 필요" ([System.Drawing.SystemIcons]::Error)
        Write-WatchdogLog "ERROR watchdog check failed: $($_.Exception.Message)"
    }
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = [System.Drawing.SystemIcons]::Information
$notifyIcon.Text = "PLC API 상태 확인 중 | 워치독 실행 중"
$notifyIcon.Visible = $true
$script:notifyIcon = $notifyIcon

$contextMenu = New-Object System.Windows.Forms.ContextMenuStrip
$openDashboard = $contextMenu.Items.Add("PLC API 열기")
$openDashboard.add_Click({ Start-Process "http://localhost:5050" })
$openLog = $contextMenu.Items.Add("워치독 로그 열기")
$openLog.add_Click({ Start-Process -FilePath "notepad.exe" -ArgumentList $script:logPath })
$restartServer = $contextMenu.Items.Add("PLC 서버 다시 시작")
$restartServer.add_Click({
    try {
        Set-WatchdogStatus "Restarting" "PLC API 재시작 중 | 워치독 감시 중" ([System.Drawing.SystemIcons]::Warning)
        Restart-Server
    }
    catch {
        Set-WatchdogStatus "WatchdogError" "워치독 오류 | 로그 확인 필요" ([System.Drawing.SystemIcons]::Error)
        Write-WatchdogLog "ERROR manual restart failed: $($_.Exception.Message)"
    }
})
$contextMenu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
$exitWatchdog = $contextMenu.Items.Add("워치독 종료")
$exitWatchdog.add_Click({
    Write-WatchdogLog "Watchdog stopped from tray menu"
    $script:checkTimer.Stop()
    $script:notifyIcon.Visible = $false
    $script:notifyIcon.Dispose()
    $contextMenu.Dispose()
    [System.Windows.Forms.Application]::ExitThread()
})
$notifyIcon.ContextMenuStrip = $contextMenu
$notifyIcon.add_DoubleClick({ Start-Process "http://localhost:5050" })

$checkTimer = New-Object System.Windows.Forms.Timer
$checkTimer.Interval = $checkIntervalSeconds * 1000
$checkTimer.add_Tick({ Invoke-WatchdogCheck })
$script:checkTimer = $checkTimer

Write-WatchdogLog "Watchdog started; check interval=${checkIntervalSeconds}s"
Invoke-WatchdogCheck
$checkTimer.Start()
[System.Windows.Forms.Application]::Run()
