import path from 'path'
import { fileURLToPath } from 'url'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import { tanstackRouter } from '@tanstack/router-plugin/webpack'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/** @type import('webpack').Configuration */
export default ({ WEBPACK_SERVE }) => ({
  target: 'web',
  mode: WEBPACK_SERVE ? 'development' : 'production',
  entry: path.resolve(__dirname, './src/index.tsx'),
  output: {
    path: path.resolve(__dirname, './dist'),
    filename: '[name].bundle.js',
    // Match this to the public base URL where Webpack serves assets.
    publicPath: '/',
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, './public/index.html'),
      filename: 'index.html',
    }),
    tanstackRouter({ target: 'solid', autoCodeSplitting: true }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /(node_modules)/,
        use: { loader: 'babel-loader' },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  devServer: {
    open: true,
    hot: true,
    // Serve the app shell for direct loads and refreshes on nested routes.
    historyApiFallback: {
      rewrites: [{ from: /./, to: '/index.html' }],
    },
    static: ['public'],
  },
})
