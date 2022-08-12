function makeConfig(name: string) {
  return {
    displayName: name,
    testEnvironment: 'jsdom',
    testMatch: [`<rootDir>/packages/${name}/**/*.test.[jt]s?(x)`],
    setupFilesAfterEnv: [`<rootDir>/packages/${name}/__tests__/jest.setup.js`],
    snapshotFormat: {
      printBasicPrototype: false,
    },
  }
}

module.exports = {
  modulePathIgnorePatterns: ['/build/'],
  projects: [
    makeConfig('router-core'),
    makeConfig('react-router'),
    // makeConfig('react-router-devtools'),
    // makeConfig('react-router-elements-to-routes'),
    // makeConfig('react-router-simple-cache'),
    // makeConfig('react-router-rank-routes'),
    // makeConfig('react-router-jsurl'),
  ],
}
