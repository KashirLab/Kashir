const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const manifestTemplate = require('../safari-extension/manifest.json');

function readWatchAdsUrl() {
  const envPath = path.resolve(__dirname, '../.env');
  const value =
    process.env.WATCH_ADS_URL ??
    (fs.existsSync(envPath)
      ? parseEnv(fs.readFileSync(envPath, 'utf8')).WATCH_ADS_URL
      : undefined);
  if (!value?.trim()) return '';

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('WATCH_ADS_URL must be an HTTPS origin.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.href !== `${url.origin}/`
  ) {
    throw new Error('WATCH_ADS_URL must be an HTTPS origin.');
  }
  return url.origin;
}

function writeSafariManifest(outputPath) {
  const origin = readWatchAdsUrl();
  const manifest = { ...manifestTemplate };
  if (origin) {
    manifest.content_scripts = [
      {
        matches: [`${origin}/*`],
        js: ['watch-ads.js'],
        run_at: 'document_idle',
      },
    ];
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

module.exports = { readWatchAdsUrl };

if (require.main === module) {
  writeSafariManifest(process.argv[2]);
}
