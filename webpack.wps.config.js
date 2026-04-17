const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/index.tsx',

  output: {
    path: path.resolve(__dirname, 'dist/wps'),
    filename: 'bundle.[contenthash:8].js',
    clean: true,
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@adapters': path.resolve(__dirname, 'src/adapters'),
      '@ai': path.resolve(__dirname, 'src/ai'),
      '@parsers': path.resolve(__dirname, 'src/parsers'),
      '@store': path.resolve(__dirname, 'src/store'),
      '@ui': path.resolve(__dirname, 'src/ui'),
    },
  },

  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpg|gif|svg|ico)$/,
        type: 'asset/resource',
      },
    ],
  },

  plugins: [
    new HtmlWebpackPlugin({
      template: './public/taskpane.html',
      filename: 'index.html',
      // WPS 不需要加载 Office.js
      officeJs: false,
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifests/jsa_publish.json', to: 'jsa_publish.json' },
        { from: 'public/assets', to: 'assets', noErrorOnMissing: true },
      ],
    }),
  ],

  performance: {
    maxAssetSize: 1024 * 1024,
    maxEntrypointSize: 1024 * 1024,
  },

  devtool: 'source-map',
};
