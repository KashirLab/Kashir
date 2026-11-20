const path = require('path');
const pkg = require('../package.json');

module.exports = {
  project: {
    ios: {
      // The binding build installs CocoaPods after both frameworks are available.
      automaticPodsInstallation: false,
    },
  },
  dependencies: {
    [pkg.name]: {
      root: path.join(__dirname, '..'),
      platforms: {
        // Codegen script incorrectly fails without this
        // So we explicitly specify the platforms with empty object
        ios: {},
        android: {},
      },
    },
  },
};
