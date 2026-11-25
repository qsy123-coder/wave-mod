# Requires elevation: add an AtLogOn(+2min) catch-up trigger to GameBananaModWatch.
# ASCII only - PowerShell 5.1 reads BOM-less UTF-8 as ANSI.
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'backups\add_logon_trigger.log'
$name = 'GameBananaModWatch'
function W($m) { Add-Content -LiteralPath $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding UTF8 }

try {
    W "start; elevated=$([Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))"
    $t = Get-ScheduledTask -TaskName $name
    $hasLogOn = @($t.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }).Count -gt 0
    if ($hasLogOn) {
        W 'AtLogOn trigger already present, nothing to do'
    } else {
        $newTrig = New-ScheduledTaskTrigger -AtLogOn
        $newTrig.Delay = 'PT2M'
        $all = @($t.Triggers) + @($newTrig)
        Set-ScheduledTask -TaskName $name -Trigger $all | Out-Null
        W 'AtLogOn(+2min) trigger added'
    }
    $t2 = Get-ScheduledTask -TaskName $name
    $kinds = ($t2.Triggers | ForEach-Object { $_.CimClass.CimClassName -replace 'MSFT_Task|Trigger' }) -join ','
    W "verify: Triggers=[$kinds] StartWhenAvailable=$($t2.Settings.StartWhenAvailable) WakeToRun=$($t2.Settings.WakeToRun)"
    W 'OK'
} catch {
    W "ERROR: $($_.Exception.Message)"
}
