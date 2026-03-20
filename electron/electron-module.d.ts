// This file is intentionally empty.
// Electron v29's electron.d.ts already declares both the global `Electron`
// namespace and `declare module 'electron' { export = Electron.CrossProcessExports; }`.
// The module is loaded correctly via the import in main.ts with
// module: CommonJS + esModuleInterop: true (see electron/tsconfig.json).
// No shim is needed.
