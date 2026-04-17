const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  mode: 'production',
  entry: './src/index.tsx',

  output: {
    path: path.resolve(__dirname, 'dist/office'),
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
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifests/manifest.xml', to: 'manifest.xml' },
        { from: 'public/assets', to: 'assets', noErrorOnMissing: true },
      ],
    }),
  ],

  performance: {
    maxAssetSize: 1024 * 1024,       // 1MB
    maxEntrypointSize: 1024 * 1024,
  },

  devtool: 'source-map',
};
