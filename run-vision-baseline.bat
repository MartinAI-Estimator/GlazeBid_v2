@echo off
setlocal
cd /d "%~dp0sidecar"

set PY=..\.venv\Scripts\python.exe
if not exist "%PY%" (
  echo ERROR: .venv not found at %PY%
  echo        Run:  npm run sidecar:install
  pause & exit /b 1
)

echo ================================================================
echo  GlazeBid AiQ - vision pipeline baseline  (McLarty Mazda)
echo  Uses ANTHROPIC_API_KEY from env or %%USERPROFILE%%\.env_glazierai
echo  Expect 2-4 minutes and real API spend.
echo ================================================================
echo.

"%PY%" -c "import fitz, anthropic, fastapi" 2>nul || (
  echo ERROR: sidecar deps missing in .venv.  Run:  npm run sidecar:install
  pause & exit /b 1
)

echo --- 1/3  run pipeline + anchor + emit candidates ---
"%PY%" qaqc\takeoff_to_candidates.py ^
  --run "qaqc\test_data\McLarty Mazda - Bid Plans - Non Marked.pdf" ^
  --job "McLarty Mazda - Bid Plans" ^
  --save-result qaqc\baseline\result_vision_McLarty.json ^
  -o qaqc\baseline\cand_vision_McLarty_Mazda.json
if errorlevel 1 ( echo PIPELINE FAILED & pause & exit /b 1 )
echo.

echo --- 2/3  score with the harness (all detections) ---
"%PY%" qaqc\eval_harness.py qaqc\baseline\cand_vision_McLarty_Mazda.json ^
  --corpus corpus\markup_corpus.json -o qaqc\baseline\vision-v1
echo.

echo --- 3/3  score again WITHOUT tag_fallback boxes (isolates the rules engine) ---
"%PY%" qaqc\takeoff_to_candidates.py qaqc\baseline\result_vision_McLarty.json ^
  --job "McLarty Mazda - Bid Plans" --no-fallback ^
  -o qaqc\baseline\cand_vision_McLarty_Mazda_nofallback.json
"%PY%" qaqc\eval_harness.py qaqc\baseline\cand_vision_McLarty_Mazda_nofallback.json ^
  --corpus corpus\markup_corpus.json -o qaqc\baseline\vision-v1-nofallback
echo.

echo ================================================================
echo  Paste everything above this line back to Fable.
echo  Baseline to beat (geometry-v0):  det-P 0.016  det-R 0.165  e2e-R 0.025
echo  McLarty geometry-v0 det-R:       0.130
echo ================================================================
pause
