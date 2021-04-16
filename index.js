if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/react-location.production.min.js')
} else {
  module.exports = require('./dist/react-location.development.js')
}
