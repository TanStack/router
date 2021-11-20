if (process.env.NODE_ENV !== 'development') {
  module.exports = {
    ReactLocationDevtools: function () {
      return null
    },
    ReactLocationDevtoolsPanel: function () {
      return null
    },
  }
} else {
  module.exports = require('./es/index.js')
}
