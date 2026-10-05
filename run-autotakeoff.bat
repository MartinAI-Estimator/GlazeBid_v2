@echo off
REM GlazeBid deterministic auto-takeoff — no model calls.
REM Usage: run-autotakeoff.bat "C:\path\to\set.pdf" [project name]
REM Writes <set>_autotakeoff.json and <set>_marked.pdf next to the PDF.
setlocal
cd /d "%~dp0sidecar"
set PDF=%~1
if "%PDF%"=="" (
  echo Usage: run-autotakeoff.bat "C:\path\to\set.pdf" [project name]
  exit /b 1
)
set NAME=%~2
python -c "import sys; sys.path.insert(0, '.'); from glazierai.modules.drawing_intelligence.autotakeoff import run_autotakeoff, write_markups; import json, os; pdf=sys.argv[1]; name=sys.argv[2] if len(sys.argv)>2 else os.path.splitext(os.path.basename(pdf))[0]; r=run_autotakeoff(pdf, name); base=os.path.splitext(pdf)[0]; json.dump(r, open(base+'_autotakeoff.json','w',encoding='utf-8'), indent=1, default=str); n=write_markups(pdf, r, base+'_marked.pdf'); print(f'{len(r[\"items\"])} items, {len(r[\"markups\"])} markups, {len(r[\"flags\"])} flagged, {r[\"elapsed_s\"]}s, 0 model calls -> '+base+'_autotakeoff.json / _marked.pdf ('+str(n)+' annotations)'); [print(f'  {c:<20} {d[\"items\"]:>3} types  qty {d[\"qty\"]:>3}  {d[\"sf\"]:>9.1f} sf') for c,d in r['totals'].items()]" "%PDF%" "%NAME%"
endlocal
