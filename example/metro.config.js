const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { getConfig } = require('react-native-builder-bob/metro-config');
const pkg = require('../package.json');
const { readWatchAdsUrl } = require('../scripts/watch-ads-config.cjs');

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const defaults = getDefaultConfig(__dirname);

module.exports = getConfig(
  {
    ...defaults,
    cacheVersion: `${defaults.cacheVersion}:${readWatchAdsUrl()}`,
  },
  { root, pkg, project: __dirname }
);
