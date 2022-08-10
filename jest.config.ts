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
  projects: [
    makeConfig('location-core'),
    makeConfig('react-location'),
    // makeConfig('react-location-devtools'),
    // makeConfig('react-location-elements-to-routes'),
    // makeConfig('react-location-simple-cache'),
    // makeConfig('react-location-rank-routes'),
    // makeConfig('react-location-jsurl'),
  ],
}
