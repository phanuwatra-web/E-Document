@echo off
title DocSign - Stopping...

echo Stopping Backend and Frontend...
taskkill /FI "WINDOWTITLE eq DocSign Backend" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq DocSign Frontend" /T /F >nul 2>&1

echo Stopping PostgreSQL...
C:\pgsql\pgsql\bin\pg_ctl.exe -D C:\pgsql\data stop

echo.
echo DocSign stopped.
pause
