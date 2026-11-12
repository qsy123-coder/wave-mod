# Register the GameBanana watch task (crawler).
# ASCII-only on purpose: Windows PowerShell 5.1 decodes BOM-less .ps1 as ANSI,
# so any non-ASCII text in here would get mangled (see README pitfalls).
# Re-run this after moving the project folder.
$root = Split-Path -Parent $PSScriptRoot
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$hidden = Join-Path $root 'local\hidden_run.vbs'
$bat = Join-Path $root 'local\run_gb.bat'

$action = New-ScheduledTaskAction -Execute $wscript -Argument ('//B //Nologo "{0}" "{1}"' -f $hidden, $bat)

# Every 15 minutes, repeat indefinitely.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 15)

# 10-minute execution limit: a hung crawl must not pile up behind IgnoreNew.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName 'GameBananaModWatch' `
    -Action $action -Trigger $trigger -Settings $settings -Force `
    -Description 'GameBanana crawler (apiv11)' | Out-Null

$task = Get-ScheduledTask -TaskName 'GameBananaModWatch'
$info = Get-ScheduledTaskInfo -TaskName 'GameBananaModWatch'
Write-Output ('Registered: {0} / state={1} / limit={2} / next={3}' -f `
    $task.TaskName, $task.State, $task.Settings.ExecutionTimeLimit, $info.NextRunTime)
