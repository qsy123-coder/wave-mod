# Register the arca.live download task (queue drainer).
# ASCII-only on purpose: Windows PowerShell 5.1 decodes BOM-less .ps1 as ANSI.
# Re-run this after moving the project folder.
$root = Split-Path -Parent $PSScriptRoot
$wscript = Join-Path $env:SystemRoot 'System32\wscript.exe'
$hidden = Join-Path $root 'local\hidden_run.vbs'
$bat = Join-Path $root 'local\run_arca_download.bat'

$action = New-ScheduledTaskAction -Execute $wscript -Argument ('//B //Nologo "{0}" "{1}"' -f $hidden, $bat)

# Every 30 minutes, repeat indefinitely.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(3) `
    -RepetitionInterval (New-TimeSpan -Minutes 30)

# IgnoreNew: a running download must not be killed by the next trigger.
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 3)

Register-ScheduledTask -TaskName 'ArcaModDownload' `
    -Action $action -Trigger $trigger -Settings $settings -Force `
    -Description 'Drain state.arca_downloads.json: arca.live images + mod files' | Out-Null

$task = Get-ScheduledTask -TaskName 'ArcaModDownload'
$info = Get-ScheduledTaskInfo -TaskName 'ArcaModDownload'
Write-Output ('Registered: {0} / state={1} / limit={2} / next={3}' -f `
    $task.TaskName, $task.State, $task.Settings.ExecutionTimeLimit, $info.NextRunTime)
