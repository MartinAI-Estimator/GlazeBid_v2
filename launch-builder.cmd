@echo off
setlocal

REM GlazeBid Builder launcher
REM 1) Kill any stale dev servers on 5173/5174
REM 2) Start the normal builder Electron workflow

echo [GlazeBid] Checking ports 5173/5174...
for %%P in (5173 5174) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo [GlazeBid] Killing PID %%A on port %%P
    taskkill /F /PID %%A >nul 2>nul
  )
)

echo [GlazeBid] Starting app...
call npm run dev:builder

echo.
echo [GlazeBid] Process exited. You can close this window.
endlocal
