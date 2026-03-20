@echo off
title GlazeBid Builder
cd /d "C:\GlazeBid_AIQ\frontend"

echo Starting GlazeBid backend (port 8000)...
start "GlazeBid Backend" /MIN /D "C:\GlazeBid_AIQ\backend" cmd /c "venv\Scripts\python.exe main.py"

echo Starting GlazeBid Studio Vite server (port 5177)...
start "GlazeBid Studio Vite" /MIN /D "C:\GlazeBid_Studio" cmd /c "npm run dev"

echo Waiting for services to initialise...
timeout /t 8 /nobreak >nul

echo Starting GlazeBid Builder...
npm run electron:dev
