const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withDictionaryAssets(config) {
  return withDangerousMod(config, ['android', (cfg) => {
    const projectRoot = cfg.modRequest.platformProjectRoot;
    const dictSrc = path.resolve(
      cfg.modRequest.projectRoot,
      'assets',
      'dictionary',
      'dict-data.json',
    );
    const dictDest = path.join(projectRoot, 'app', 'src', 'main', 'assets', 'dictionary');

    if (fs.existsSync(dictSrc)) {
      fs.mkdirSync(dictDest, { recursive: true });
      fs.copyFileSync(dictSrc, path.join(dictDest, 'dict-data.json'));
      console.log('[dictionary] Copied dict-data.json');
    } else {
      console.warn('[dictionary] dict-data.json not found at ' + dictSrc);
    }

    return cfg;
  }]);
}

module.exports = withDictionaryAssets;
