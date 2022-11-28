const path = require('path')

module.exports = {
  rootDirectory: path.resolve(__dirname, '..'),
  sourceDirectory: path.resolve(__dirname, '../src/'),
  routesDirectory: path.resolve(__dirname, '../src/routes'),
  routeGenDirectory: path.resolve(__dirname, '../src/routes.generated'),
}
