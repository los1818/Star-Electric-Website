@echo off
rem Double-click to start Sparks on Windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1" %*
pause
