// common project configuration used by the other configs

const path = require('path')

module.exports = {
  rootDir: path.resolve(__dirname, '..'),
  moduleDirectories: [
    'node_modules',
    path.resolve(__dirname, '../src'),
    'shared',
    __dirname,
  ],
  testPathIgnorePatterns: ['<rootDir>/server/'],
  moduleNameMapper: {
    // module must come first
    '\\.module\\.css$': 'identity-obj-proxy',
    '\\.css$': require.resolve('./style-mock.js'),
    // can also map files that are loaded by webpack with the file-loader
  },
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
    'jest-watch-select-projects',
  ],
}
