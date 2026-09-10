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
    // Serve assets from the root so nested routes resolve bundle URLs correctly
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
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
  ],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /(node_modules)/,
        use: { loader: 'swc-loader' },
      },
    ],
  },
  devServer: {
    hot: true,
    // SPA fallback: serve index.html for direct loads/refreshes at nested routes
    historyApiFallback: {
      rewrites: [{ from: /./, to: '/index.html' }],
    },
    static: ['public'],
  },
})
