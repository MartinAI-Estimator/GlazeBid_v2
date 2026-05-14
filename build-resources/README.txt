GlazeBid Build Resources
========================

Place the following files in this directory before running `npm run dist:win`:

  icon.ico          — Windows application icon (256x256 ICO format)
  icon.png          — PNG version for Linux/Mac (512x512)
  LICENSE.txt       — End user license agreement (shown during NSIS install)

To generate icon.ico from a PNG:
  Use https://convertio.co/png-ico/ or ImageMagick:
  magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

Build Commands:
  npm run dist:win          — Full Windows installer (.exe) in /release/
  npm run dist:win:dir      — Unpacked directory (faster, for testing)
  npm run pack              — Unpacked in /dist/ (fastest, no installer)

Requirements:
  - Node.js 18+
  - Windows or Wine (for Windows builds from macOS/Linux)
  - Run `npm install` before first build
