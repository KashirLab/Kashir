const path = require('path');
const { getConfig } = require('react-native-builder-bob/babel-config');
const pkg = require('../package.json');
const { readWatchAdsUrl } = require('../scripts/watch-ads-config.cjs');

const root = path.resolve(__dirname, '..');
const watchAdsUrl = readWatchAdsUrl();

function inlineWatchAdsUrl({ types }) {
  return {
    visitor: {
      MemberExpression(member) {
        if (member.matchesPattern('process.env.WATCH_ADS_URL')) {
          member.replaceWith(types.stringLiteral(watchAdsUrl));
        }
      },
    },
  };
}

module.exports = getConfig(
  {
    presets: ['module:@react-native/babel-preset'],
    plugins: [inlineWatchAdsUrl],
  },
  { root, pkg }
);
