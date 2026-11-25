# Make GameBanana scheduled tasks survive sleep/resume.
# 1) StartWhenAvailable: run a missed trigger as soon as the machine wakes.
# 2) WakeToRun: allow the timer to wake the machine (needs RTCWAKE in the power plan).
# 3) Extra AtLogOn + 2 min trigger on the watcher as a catch-up.
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 parses BOM-less UTF-8 as ANSI.
$ErrorActionPreference = 'Stop'
$tasks = 'GameBananaModWatch', 'GameBananaModDownload'
$changed = @()
$failed  = @()

foreach ($name in $tasks) {
    try {
        $t = Get-ScheduledTask -TaskName $name

        $s = $t.Settings
        $s.StartWhenAvailable = $true
        $s.WakeToRun          = $true
        $s.DisallowStartIfOnBatteries = $false
        $s.StopIfGoingOnBatteries     = $false
        Set-ScheduledTask -TaskName $name -Settings $s | Out-Null
        $changed += "  * $($name): StartWhenAvailable=true WakeToRun=true"

        if ($name -eq 'GameBananaModWatch') {
            $t = Get-ScheduledTask -TaskName $name
            $hasLogOn = @($t.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }).Count -gt 0
            if (-not $hasLogOn) {
                $newTrig = New-ScheduledTaskTrigger -AtLogOn
                $newTrig.Delay = 'PT2M'
                $all = @($t.Triggers) + @($newTrig)
                Set-ScheduledTask -TaskName $name -Trigger $all | Out-Null
                $changed += "  + $($name): AtLogOn(+2min) catch-up trigger added"
            } else {
                $changed += "  = $($name): AtLogOn trigger already present"
            }
        }
    } catch {
        $failed += "  ! $($name) failed: $($_.Exception.Message)"
    }
}

try {
    powercfg /setacvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
    powercfg /setdcvalueindex SCHEME_CURRENT SUB_SLEEP RTCWAKE 1 | Out-Null
    powercfg /setactive SCHEME_CURRENT | Out-Null
    $changed += "  * power plan: wake timers enabled (AC/DC)"
} catch {
    $failed += "  ! powercfg failed: $($_.Exception.Message)"
}

Write-Output '--- result ---'
$changed | ForEach-Object { Write-Output $_ }
$failed  | ForEach-Object { Write-Output $_ }

Write-Output '--- verify ---'
foreach ($name in $tasks) {
    $t = Get-ScheduledTask -TaskName $name
    $info = Get-ScheduledTaskInfo -TaskName $name
    $trigKinds = ($t.Triggers | ForEach-Object { $_.CimClass.CimClassName -replace 'MSFT_Task|Trigger' }) -join ','
    Write-Output ("{0}: StartWhenAvailable={1} WakeToRun={2} Triggers=[{3}] NextRun={4}" -f `
        $name, $t.Settings.StartWhenAvailable, $t.Settings.WakeToRun, $trigKinds, $info.NextRunTime)
}
Write-Output '--- waketimers ---'
powercfg /waketimers
