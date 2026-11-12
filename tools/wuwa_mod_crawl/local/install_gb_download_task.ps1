# Register the GameBanana download task (queue drainer).
# ASCII-only on purpose: Windows PowerShell 5.1 decodes BOM-less .ps1 as ANSI,
# so any non-ASCII text in here would get mangled (see README pitfalls).
# Re-run this after moving the project folder.
$root = Split-Path -Parent $PSScriptRoot
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$hidden = Join-Path $root 'local\hidden_run.vbs'
$bat = Join-Path $root 'local\run_gb_download.bat'

$action = New-ScheduledTaskAction -Execute $wscript -Argument ('//B //Nologo "{0}" "{1}"' -f $hidden, $bat)

# Every 30 minutes, repeat indefinitely.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) `
    -RepetitionInterval (New-TimeSpan -Minutes 30)

# IgnoreNew (not StopExisting): killing a 30-minute download every 30 minutes
# would never finish anything. 3h limit leaves room for max_run_minutes = 120.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3)

Register-ScheduledTask -TaskName 'GameBananaModDownload' `
    -Action $action -Trigger $trigger -Settings $settings -Force `
    -Description 'Drain state.gb_downloads.json: original images + mod files' | Out-Null

$task = Get-ScheduledTask -TaskName 'GameBananaModDownload'
$info = Get-ScheduledTaskInfo -TaskName 'GameBananaModDownload'
Write-Output ('Registered: {0} / state={1} / limit={2} / next={3}' -f `
    $task.TaskName, $task.State, $task.Settings.ExecutionTimeLimit, $info.NextRunTime)
