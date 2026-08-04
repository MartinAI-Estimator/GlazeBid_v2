@echo off
title GlazeBid v2
cd /d "C:\Users\mjaym\GlazeBid v2"

echo Stopping any running GlazeBid dev servers...

:: Kill whatever is listening on the Builder (5175) and Studio (5174) dev ports.
:: Builder uses strictPort, so a stale server on 5175 makes Electron attach to
:: OLD code instead of your latest edits — always clear it first.
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5175 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5174 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1

:: Kill any leftover dev Electron shell
taskkill /F /IM electron.exe /T >nul 2>&1

timeout /t 2 /nobreak >nul

echo Starting GlazeBid v2...
echo.

:: Check node_modules exist
if not exist "node_modules" (
    echo Installing root dependencies...
    call npm install
)
if not exist "apps\builder\node_modules" (
    echo Installing builder dependencies...
    call npm install --workspace apps/builder
)
if not exist "apps\studio\node_modules" (
    echo Installing studio dependencies...
    call npm install --workspace apps/studio
)

:: Build preloads then launch everything
call "C:\Program Files\nodejs\npm.cmd" run dev:builder

exit /b %ERRORLEVEL%
