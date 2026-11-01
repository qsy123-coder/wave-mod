@echo off
rem GameBanana original-image + mod-file downloader (runs locally).
rem Invoked by Task Scheduler every 30 minutes; drains state.gb_downloads.json.
rem NOTE: keep this file ASCII-only -- cmd.exe decodes .bat as the OEM codepage.
cd /d "%~dp0.."
"F:\Anaconda\python.exe" run_gb_download.py >> "gamebanana_download.log" 2>&1
