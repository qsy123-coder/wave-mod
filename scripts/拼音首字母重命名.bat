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

rem Do not rename this bat itself if it sits inside the target folder.
set "EXCLUDE=%~nx0"

rem Drop a folder/file onto this bat, or paste a path when prompted.
set "TARGET=%~1"
if not defined TARGET (
  echo Drag a folder or file here, or paste its full path, then press Enter.
  set /p "TARGET=Path: "
)
if not defined TARGET (
  echo [ERROR] No path given.
  if not defined PY_RENAME_NO_PAUSE pause
  exit /b 1
)

rem Remove quotes added by drag-and-drop, and a trailing backslash.
set "TARGET=%TARGET:"=%"
if "%TARGET:~-1%"=="\" set "TARGET=%TARGET:~0,-1%"

rem Always process the dropped item itself:
rem   folder -> wrap it in a pinyin-named outer folder
rem   file   -> rename it to pinyin initials
set ARG=--path="%TARGET%"

echo.
echo Target: %TARGET%
echo.
node "%SCRIPT%" %ARG% --mode=auto --exclude="%EXCLUDE%" --apply
if errorlevel 1 goto :failed
echo.
echo Done.
goto :done

:failed
echo.
echo [ERROR] The operation failed. Nothing else was changed.
echo.

:done
if not defined PY_RENAME_NO_PAUSE pause
endlocal
exit /b 0
