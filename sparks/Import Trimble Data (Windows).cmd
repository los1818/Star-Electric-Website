@echo off
rem Double-click to load your Trimble exports and users (from C:\Sparks\import) into Sparks.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\import-local.ps1" %*
