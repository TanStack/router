process.chdir('../..')

module.exports = require('../../rollup.config.js').createRollupConfig(
  '@tanstack/start-vite-plugin',
)
