// Runs during `vscode:prepublish` so a release is never packaged without
// telemetry credentials by accident. See src/telemetry/config.ts.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'telemetry-config.json');
let ok = false;
try {
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok = /^G-[A-Z0-9]+$/.test(cfg.measurementId) && typeof cfg.apiSecret === 'string' && cfg.apiSecret.length > 0;
} catch {
  // missing or invalid JSON
}

if (!ok) {
  console.warn(
    '\n⚠️  telemetry-config.json is missing or invalid — this package will have telemetry DISABLED.\n' +
    '   Create it at the repo root: { "measurementId": "G-XXXXXXX", "apiSecret": "..." }\n'
  );
}
