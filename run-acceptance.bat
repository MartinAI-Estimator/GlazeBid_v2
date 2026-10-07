@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0sidecar"

rem ================================================================
rem  GlazeBid auto-takeoff - ACCEPTANCE RUN (McLarty, Curtis, Hope)
rem  Runs the full pipeline (now with the tiled page reader) on the
rem  three blank sets and scores each against Martin's markups.
rem  Uses ANTHROPIC_API_KEY from env or %USERPROFILE%\.env_glazierai
rem  Expect ~10-25 min per set and real API spend (accuracy first).
rem  Results: sidecar\qaqc\runs\<date>\
rem ================================================================

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" set PY=python
"%PY%" -c "import fitz, anthropic, fastapi" 2>nul || (
  echo ERROR: sidecar deps missing.  Run:  npm run sidecar:install
  pause & exit /b 1
)

for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"') do set STAMP=%%i
set OUT=qaqc\runs\%STAMP%
mkdir "%OUT%" 2>nul
set SETS=%USERPROFILE%\OneDrive\Arch Drawing Markups\New Drawings Sets

call :run "McLarty Mazda - Bid Plans"                 "%SETS%\McLarty Mazda - Bid Plans - Non Marked.pdf"              mclarty
call :run "Curtis MS Renovation - Bid Set"            "%SETS%\Curtis MS Renovation - Bid Set - Non Marked.pdf"         curtis
call :run "Hope Aquatic & Rec Center - Bid Drawings"  "%SETS%\Hope Aquatic & Rec Center - Bid Drawings - Non Marked.pdf" hope

echo.
echo ================================================================
echo  SCORE (eval_v2 - all three jobs)
echo ================================================================
"%PY%" qaqc\eval_v2.py "%OUT%\cand_mclarty.json" "%OUT%\cand_curtis.json" "%OUT%\cand_hope.json" ^
   --corpus corpus\markup_corpus.json -o "%OUT%" > "%OUT%\score.txt" 2>&1
type "%OUT%\score.txt"
echo.
echo  Starting line (geometry-v0 on eval_v2):  items R=0.17 P=0.017  doors 0  exclusions 0
echo  Results folder:  sidecar\%OUT%
echo  Tell Claude the run finished - it reads the folder directly.
pause
exit /b 0

:run
echo.
echo ---- %~1 ----
if not exist "%~2" (
  echo   MISSING: %~2
  echo   In File Explorer right-click the file - "Always keep on this device" - then rerun.
  exit /b 0
)
"%PY%" qaqc\takeoff_to_candidates.py --run "%~2" --job "%~1" ^
  --save-result "%OUT%\result_%~3.json" -o "%OUT%\cand_%~3.json" --source page-reader-v1 > "%OUT%\log_%~3.txt" 2>&1
if errorlevel 1 ( echo   FAILED - see %OUT%\log_%~3.txt ) else ( echo   done )
exit /b 0
