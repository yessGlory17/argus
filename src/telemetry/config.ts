import * as fs from 'fs';
import * as path from 'path';

// GA4 Measurement Protocol credentials, read from `telemetry-config.json` at
// the extension root. That file is gitignored and only exists on the
// maintainer's machine, so it ships inside the published .vsix but never
// lands in the public repo; builds without it simply have telemetry off.
//
//   { "measurementId": "G-XXXXXXX", "apiSecret": "..." }
//
// The API secret is readable by anyone who unpacks the .vsix — it only gates
// who can write events. If fake data shows up, create a new secret in GA,
// delete the old one and publish a new version.
function load(): { measurementId: string; apiSecret: string } {
  try {
    const file = path.join(__dirname, '..', '..', 'telemetry-config.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      measurementId: typeof raw.measurementId === 'string' ? raw.measurementId : '',
      apiSecret: typeof raw.apiSecret === 'string' ? raw.apiSecret : '',
    };
  } catch {
    return { measurementId: '', apiSecret: '' };
  }
}

const config = load();

export const GA_MEASUREMENT_ID = config.measurementId;
export const GA_API_SECRET = config.apiSecret;
