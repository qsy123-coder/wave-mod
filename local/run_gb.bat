@echo off
rem GameBanana crawler (runs locally). Invoked by Windows Task Scheduler every 15 min.
rem NOTE: keep this file ASCII-only -- cmd.exe decodes .bat as the OEM codepage (GBK
rem here), so UTF-8 Chinese in comments gets mangled and can break parsing.
cd /d "%~dp0.."
"F:\Anaconda\python.exe" run_gb_once.py >> "gamebanana.log" 2>&1
