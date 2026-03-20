@echo off
title GlazeBid v2
cd /d "C:\Users\mjaym\GlazeBid v2"

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
