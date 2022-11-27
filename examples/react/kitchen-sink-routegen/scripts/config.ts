import path from 'path'

export const config = {
  rootDirectory: path.resolve(__dirname, '..'),
  sourceDirectory: path.resolve(__dirname, '../src/'),
  routesDirectory: path.resolve(__dirname, '../src/routes'),
  routeGenDirectory: path.resolve(__dirname, '../src/routes.generated'),
}

export type GeneratorConfig = typeof config
