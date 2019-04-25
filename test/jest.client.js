module.exports = {
  ...require('./jest-common'),
  displayName: 'dom',
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: [require.resolve('./setup-tests.js')],
}
