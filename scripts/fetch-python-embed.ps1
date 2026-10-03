<#
.SYNOPSIS
  Build a self-contained Python runtime for the GlazeBid sidecar.

.DESCRIPTION
  Downloads the official Windows embeddable Python distribution into
  <repo>/python-embed, enables site-packages, bootstraps pip, and installs
  sidecar/requirements.txt into it.

  electron-builder then ships python-embed/ as <install>/resources/python
  (see package.json build.extraResources), and electron/main.ts
  getSidecarPythonPath() launches resources/python/python.exe.

  The customer never needs Python installed.  Run this once per machine
  that builds the installer, and again whenever requirements.txt changes.

.USAGE
  npm run sidecar:bundle-python
    -- or --
  powershell -ExecutionPolicy Bypass -File scripts/fetch-python-embed.ps1 [-PythonVersion 3.12.7]
#>

param(
  [string]$PythonVersion = "3.12.7",
  [switch]$Force
)

$ErrorActionPreference = "Stop"
$Root    = Split-Path -Parent $PSScriptRoot
$Target  = Join-Path $Root "python-embed"
$Req     = Join-Path $Root "sidecar\requirements.txt"
$Marker  = Join-Path $Target ".glazebid-bundle-ok"

Write-Host "== GlazeBid sidecar Python bundle ==" -ForegroundColor Cyan
Write-Host "   version : $PythonVersion"
Write-Host "   target  : $Target"

if ((Test-Path $Marker) -and -not $Force) {
  $stamp = Get-Content $Marker -ErrorAction SilentlyContinue
  Write-Host "   already bundled ($stamp). Use -Force to rebuild." -ForegroundColor Yellow
  exit 0
}

if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
New-Item -ItemType Directory -Path $Target | Out-Null

# 1. Embeddable zip -------------------------------------------------------------
$zipName = "python-$PythonVersion-embed-amd64.zip"
$zipUrl  = "https://www.python.org/ftp/python/$PythonVersion/$zipName"
$zipPath = Join-Path $env:TEMP $zipName
Write-Host "-> downloading $zipUrl"
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
Write-Host "-> extracting"
Expand-Archive -Path $zipPath -DestinationPath $Target -Force
Remove-Item $zipPath -Force

# 2. Enable site-packages ---------------------------------------------------------
#    The embeddable build ships pythonXY._pth with `#import site` commented out,
#    which means pip-installed packages are invisible.  Uncomment it.
$pth = Get-ChildItem $Target -Filter "python*._pth" | Select-Object -First 1
if (-not $pth) { throw "No python*._pth found in $Target" }
$content = Get-Content $pth.FullName
$content = $content -replace '^#\s*import site\s*$', 'import site'
if ($content -notcontains 'import site') { $content += 'import site' }
Set-Content -Path $pth.FullName -Value $content -Encoding ASCII
Write-Host "-> enabled site-packages in $($pth.Name)"

# 3. pip --------------------------------------------------------------------------
$py     = Join-Path $Target "python.exe"
$getPip = Join-Path $env:TEMP "get-pip.py"
Write-Host "-> bootstrapping pip"
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip -UseBasicParsing
& $py $getPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "get-pip failed ($LASTEXITCODE)" }
Remove-Item $getPip -Force

# 4. Sidecar requirements ---------------------------------------------------------
if (-not (Test-Path $Req)) { throw "requirements.txt not found: $Req" }
Write-Host "-> pip install -r sidecar/requirements.txt"
& $py -m pip install --no-warn-script-location --upgrade -r $Req
if ($LASTEXITCODE -ne 0) { throw "pip install failed ($LASTEXITCODE)" }

# 5. Smoke test — import every top-level package the sidecar needs ---------------
Write-Host "-> smoke test"
& $py -c "import fitz, fastapi, uvicorn, numpy, scipy, PIL, pdfplumber, anthropic; print('   imports OK:', fitz.__doc__.split()[0], 'fastapi', fastapi.__version__)"
if ($LASTEXITCODE -ne 0) { throw "smoke test failed — a sidecar dependency did not install" }

# 6. Trim — nothing the app needs at runtime ----------------------------------------
Get-ChildItem $Target -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem (Join-Path $Target "Lib\site-packages") -Recurse -Directory -Filter "tests" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Set-Content -Path $Marker -Value ("python $PythonVersion  " + (Get-Date -Format "yyyy-MM-dd HH:mm"))
$size = [math]::Round(((Get-ChildItem $Target -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Write-Host "== done: $size MB in python-embed/ ==" -ForegroundColor Green
