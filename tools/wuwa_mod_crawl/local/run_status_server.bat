@echo off
rem Local Mod download dashboard. Opens http://127.0.0.1:8765/ in the browser.
rem If the dashboard is already running, just open the page instead of starting
rem a second copy on the next free port.
rem ASCII-only on purpose: cmd.exe decodes .bat as the OEM codepage.
cd /d "%~dp0.."

powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:8765/api/status'; if ($r.StatusCode -eq 200) { Start-Process 'http://127.0.0.1:8765/'; exit 0 } } catch { }; exit 1"
if %errorlevel%==0 goto :eof

"F:\Anaconda\python.exe" web_status.py
pause
