const isTest = String(process.env.NODE_ENV) === 'test'
const isProd = String(process.env.NODE_ENV) === 'production'

module.exports = {
  presets: [
    ['@babel/preset-env', { modules: isTest ? 'commonjs' : false }],
    '@babel/preset-react',
  ],
  plugins: [
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-class-properties',
    '@babel/plugin-proposal-object-rest-spread',
    isTest ? 'babel-plugin-dynamic-import-node' : null,
  ].filter(Boolean),
}
