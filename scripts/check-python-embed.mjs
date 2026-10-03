/**
 * check-python-embed.mjs — predist guard.
 *
 * Refuses to build an installer that would ship without the bundled Python
 * runtime.  Without it every AI feature (AiQ, Spec Reader, Drawing
 * Intelligence) silently fails on the customer's machine because the sidecar
 * cannot start.  See scripts/fetch-python-embed.ps1.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = path.join(root, 'python-embed', process.platform === 'win32' ? 'python.exe' : 'bin/python3');
const marker = path.join(root, 'python-embed', '.glazebid-bundle-ok');

if (!fs.existsSync(python) || !fs.existsSync(marker)) {
  console.error('\n✖ python-embed/ is missing or incomplete.');
  console.error('  The installer would ship without a Python runtime and no AI feature would work.');
  console.error('  Run:  npm run sidecar:bundle-python\n');
  process.exit(1);
}

// Requirements changed after the bundle was built → stale bundle.
const req = path.join(root, 'sidecar', 'requirements.txt');
if (fs.existsSync(req) && fs.statSync(req).mtimeMs > fs.statSync(marker).mtimeMs) {
  console.error('\n✖ sidecar/requirements.txt is newer than python-embed/.');
  console.error('  Run:  npm run sidecar:bundle-python -- -Force\n');
  process.exit(1);
}

console.log('✔ python-embed/ present (' + fs.readFileSync(marker, 'utf-8').trim() + ')');
