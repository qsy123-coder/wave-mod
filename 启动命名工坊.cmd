@echo off
rem Mod 命名工坊 launcher. 内容保持纯 ASCII：cmd 按 GBK 解析 .bat，中文注释会拆坏行。
chcp 65001 >nul
title Mod Rename UI
cd /d "%~dp0"
node "tools\mod-rename\server.mjs" --open
echo.
echo Window can be closed.
pause >nul
