@echo off
setlocal
cd /d "%~dp0"

echo ================================================================
echo  GlazeBid v2 - commit and push to GitHub
echo  Repo: MartinAI-Estimator/GlazeBid_v2
echo ================================================================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERROR: this folder is not a git repository.
  pause
  exit /b 1
)

echo --- Current branch ---
git rev-parse --abbrev-ref HEAD
echo.

echo --- Remote ---
git remote -v
echo.

echo --- Files that will be committed ---
git status --short
echo.

echo --- Sanity check: anything over 50 MB would break the push ---
git ls-files --others --exclude-standard --cached > "%TEMP%\gb_files.txt"
for /f "usebackq delims=" %%F in ("%TEMP%\gb_files.txt") do (
  if exist "%%F" (
    for %%S in ("%%F") do if %%~zS GTR 52428800 echo   LARGE: %%~zS bytes  %%F
  )
)
del "%TEMP%\gb_files.txt" >nul 2>&1
echo   (no LARGE lines above = good)
echo.

echo ================================================================
echo  Press Ctrl+C now to abort, or
pause
echo ================================================================
echo.

echo --- Staging ---
git add -A
echo.

echo --- Committing ---
git commit -m "feat(aiq): vision-led drawing intelligence pipeline, markup corpus, eval harness" -m "Adds sidecar/glazierai drawing_intelligence modules (sheet classifier, legend extractor, elevation/schedule readers, takeoff assembler, vision helper), spec_reader service, 33-job Bluebeam markup corpus, eval harness and recorded baseline, plus Builder data-integrity fixes (canonical SystemType, unified frame model, laborCalcEngine consolidation, dead-backend shim)."
if errorlevel 1 echo (nothing new to commit - continuing to push)
echo.

echo --- Pushing ---
git push -u origin HEAD
if errorlevel 1 (
  echo.
  echo ================================================================
  echo  PUSH FAILED.
  echo.
  echo  Most likely cause: GitHub credentials.
  echo  Fix with GitHub CLI:
  echo      winget install --id GitHub.cli
  echo      gh auth login
  echo      gh auth setup-git
  echo  Then run this script again.
  echo ================================================================
  pause
  exit /b 1
)

echo.
echo ================================================================
echo  DONE. Verify at:
echo  https://github.com/MartinAI-Estimator/GlazeBid_v2/commits
echo ================================================================
pause
