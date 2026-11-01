@echo off
rem arca.live original-image + mod-file downloader (runs locally).
rem Invoked by Task Scheduler every 30 minutes; drains state.arca_downloads.json.
rem NOTE: keep this file ASCII-only -- cmd.exe decodes .bat as the OEM codepage.
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
"F:\Anaconda\python.exe" run_arca_download.py >> "arca_download.log" 2>&1
