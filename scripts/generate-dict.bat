@echo off
setlocal

REM Generate the bundled JaReader dictionary from the local EPWING source.
REM The PowerShell script auto-detects the source directory by START.ebz/HONMON.ebz.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-dict.ps1"
exit /b %ERRORLEVEL%
