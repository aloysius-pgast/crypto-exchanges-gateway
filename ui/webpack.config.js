const webpack = require('webpack');
const path = require('path');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const extractCSS = new ExtractTextPlugin('[name].fonts.css');
const extractSCSS = new ExtractTextPlugin('[name].styles.css');

const BUILD_DIR = path.resolve(__dirname, 'dist');
const SRC_DIR = path.resolve(__dirname, 'src');

console.log('BUILD_DIR', BUILD_DIR);
console.log('SRC_DIR', SRC_DIR);

module.exports = {
  entry: {
    index: [SRC_DIR + '/index.js']
	},
  output: {
    path: BUILD_DIR,
    filename: '[name].bundle.js'
  },
  watch: false,
  devtool: "#eval-source-map",
  devServer: {
    contentBase: 'public',
    // port: 8081,
    host: '0.0.0.0',
    compress: false,
    hot: true,
    open: true
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules(?!\/webpack-dev-server)/,
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
            presets: ['react', 'env']
          }
        }
      },
      {
        test: /\.html$/,
        loader: 'html-loader'
      },
      {
        test: /\.(scss)$/,
        use: ['css-hot-loader'].concat(extractSCSS.extract({
          fallback: 'style-loader',
          use: [
            {
              loader: 'css-loader',
              options: { alias: { '../img': '../public/img' } }
            },
            {
              loader: 'sass-loader'
            }
          ]
        }))
      },
      {
        test: /\.css$/,
        use: extractCSS.extract({
          fallback: 'style-loader',
          use: 'css-loader'
        })
      },
      {
        test: /\.(png|jpg|jpeg|gif|ico)$/,
        use: [
          {
            // loader: 'url-loader'
            loader: 'file-loader',
            options: {
              name: './img/[name].[hash].[ext]'
            }
          }
        ]
      },
      {
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        loader: 'file-loader',
        options: {
          name: './fonts/[name].[hash].[ext]'
        }
      }]
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin(),
    new webpack.optimize.UglifyJsPlugin(),
    new webpack.NamedModulesPlugin(),
    extractCSS,
    extractSCSS,
    new HtmlWebpackPlugin(
      {
        inject: true,
        template: './public/index.html'
      }
    ),
    new CopyWebpackPlugin([
        {from: './public/img', to: 'img'},
        {from: './public/help', to: 'help'},
        {from: './public/dashboard.md', to: 'dashboard.md'},
      ],
      {copyUnmodified: false}
    )
  ]
}
;
