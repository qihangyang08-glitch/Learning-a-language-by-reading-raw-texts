// Add .db to asset extensions so Metro bundles our pre-built SQLite database
const { getDefaultConfig } = require('expo/metro-config');
const exclusionListModule = require('metro-config/private/defaults/exclusionList');
const exclusionList = exclusionListModule.default ?? exclusionListModule;

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.resolver.assetExts.push('db');
defaultConfig.resolver.blockList = exclusionList([
  /[/\\]assets[/\\]models[/\\]kokoro[/\\].*/,
]);

module.exports = defaultConfig;
