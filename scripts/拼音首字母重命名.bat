@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Pinyin initials rename

rem Prefer the .mjs next to this bat; fall back to the repo copy if the bat was moved.
set "SCRIPT=%~dp0pinyin-initials-rename.mjs"
if not exist "%SCRIPT%" if defined WAVEMOD_SCRIPTS set "SCRIPT=%WAVEMOD_SCRIPTS%\pinyin-initials-rename.mjs"
if not exist "%SCRIPT%" set "SCRIPT=F:\Projects\wave-mod\scripts\pinyin-initials-rename.mjs"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  if not defined PY_RENAME_NO_PAUSE pause
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo [ERROR] Script not found:
  echo   %SCRIPT%
  if not defined PY_RENAME_NO_PAUSE pause
  exit /b 1
)

rem Do not rename this bat itself if it sits inside a target folder.
set "EXCLUDE=%~nx0"

rem Dragging several folders/files onto this bat passes them as %1 %2 %3 ...
if "%~1"=="" goto :prompt

:loop
if "%~1"=="" goto :done
call :process "%~1"
shift
goto :loop

:prompt
echo Drag a folder or file here, or paste its full path, then press Enter.
set "TARGET="
set /p "TARGET=Path: "
if not defined TARGET goto :done
call :process "%TARGET%"
goto :done

rem ---------------------------------------------------------------------------
rem Process one item: folder -> wrap it in a pinyin folder, file -> rename it.
rem ---------------------------------------------------------------------------
:process
set "TARGET=%~1"
set "TARGET=%TARGET:"=%"
if "%TARGET:~-1%"=="\" set "TARGET=%TARGET:~0,-1%"
if not defined TARGET exit /b 0

echo.
echo Target: %TARGET%
echo.
node "%SCRIPT%" --path="%TARGET%" --mode=auto --exclude="%EXCLUDE%" --apply
if errorlevel 1 (
  echo.
  echo [ERROR] Failed: %TARGET%
  echo.
)
exit /b 0

:done
if not defined PY_RENAME_NO_PAUSE pause
endlocal
exit /b 0
