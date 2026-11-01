@echo off
rem Local sync from the Seoul server. Invoked by Windows Task Scheduler every 10 min.
rem NOTE: keep this file ASCII-only -- cmd.exe decodes .bat as the OEM codepage (GBK
rem here), so UTF-8 Chinese in comments gets mangled and can break parsing.
rem "< NUL" gives this process tree a valid stdin. Without it ssh/scp inherit an
rem invalid handle under Task Scheduler and block forever waiting for input.
powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0sync.ps1" < NUL
