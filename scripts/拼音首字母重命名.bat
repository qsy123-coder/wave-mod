@echo off
setlocal EnableExtensions
chcp 65001 >nul
title Pinyin initials rename

rem Keep the .mjs next to this bat, so moving the repo does not break it.
set "SCRIPT=%~dp0pinyin-initials-rename.mjs"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found in PATH.
  echo Install Node.js, or add its install folder to PATH.
  if not defined PY_RENAME_NO_PAUSE pause
  exit /b 1
)

if not exist "%SCRIPT%" (
  echo [ERROR] Script not found:
  echo   %SCRIPT%
  if not defined PY_RENAME_NO_PAUSE pause
  exit /b 1
)

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

rem Folder: process its children (--dir). File: process itself (--path).
if exist "%TARGET%\" (
  set ARG=--dir="%TARGET%"
) else (
  set ARG=--path="%TARGET%"
)

rem auto = files rename, folders wrap; rename = everything in place; wrap = everything wrapped.
set "MODE=auto"
if defined PY_RENAME_MODE (
  set "MODE=%PY_RENAME_MODE%"
) else (
  echo.
  echo Mode:
  echo   1 = Auto - files rename, folders wrap   [default]
  echo   2 = Rename everything in place
  echo   3 = Wrap everything in a pinyin folder
  set "MODE_CHOICE="
  set /p "MODE_CHOICE=Choose 1/2/3: "
  if "%MODE_CHOICE%"=="2" set "MODE=rename"
  if "%MODE_CHOICE%"=="3" set "MODE=wrap"
)

echo.
echo Target: %TARGET%
echo Mode:   %MODE%
echo.
echo --- PREVIEW (no files will be changed) ---
node "%SCRIPT%" %ARG% --mode=%MODE%
if errorlevel 1 goto :failed

if defined PY_RENAME_DRY_RUN goto :done

echo.
if defined PY_RENAME_YES goto :apply
set "CONFIRM="
set /p "CONFIRM=Apply these changes? [y/N]: "
if /i not "%CONFIRM%"=="y" goto :cancelled

:apply
echo.
echo --- APPLYING ---
node "%SCRIPT%" %ARG% --mode=%MODE% --apply
if errorlevel 1 goto :failed
echo.
echo Done.
goto :done

:cancelled
echo.
echo Cancelled. No files were changed.
goto :done

:failed
echo.
echo [ERROR] The operation failed. Nothing else was changed.
echo.

:done
if not defined PY_RENAME_NO_PAUSE pause
endlocal
exit /b 0
