@echo off
title DocSign - Starting...

echo [1/3] Starting PostgreSQL...
C:\pgsql\pgsql\bin\pg_ctl.exe -D C:\pgsql\data -l C:\pgsql\pg.log start
timeout /t 2 /nobreak >nul

echo [2/3] Starting Backend (port 5000)...
start "DocSign Backend" cmd /k "cd /d C:\Users\Acer\Desktop\Document\docsign\backend && npm run dev"
timeout /t 3 /nobreak >nul

echo [3/3] Starting Frontend (port 3000)...
start "DocSign Frontend" cmd /k "cd /d C:\Users\Acer\Desktop\Document\docsign\frontend && npm run dev"
timeout /t 5 /nobreak >nul

echo.
echo ====================================
echo  DocSign is starting up...
echo  Open: http://localhost:3000
echo ====================================
echo.
start "" "http://localhost:3000"
pause
