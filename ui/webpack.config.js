const webpack = require('webpack');
const fs = require('fs');
const path = require('path');
const util = require('util');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const timestamp = Date.now();

const extractCSS = new ExtractTextPlugin(`${timestamp}.[name].fonts.css`);
const extractSCSS = new ExtractTextPlugin(`${timestamp}.[name].styles.css`);

const BUILD_DIR = path.resolve(__dirname, 'dist');
const SRC_DIR = path.resolve(__dirname, 'src');

console.log('BUILD_DIR', BUILD_DIR);
console.log('SRC_DIR', SRC_DIR);
module.exports = function(env){
  if (undefined === env) {
      env = {};
  }
  return {
      entry: {
        index: [SRC_DIR + '/index.js']
      },
      output: {
        path: BUILD_DIR,
        filename: `${timestamp}.[name].bundle.js`
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
                  name: `./img/${timestamp}.[name].[ext]`
                }
              }
            ]
          },
          {
            test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
            loader: 'file-loader',
            options: {
              name: `./fonts/${timestamp}.[name].[ext]`
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
            template: './public/index.ejs',
            cache:false,
            cacheManifest:(true === env.dev) ? '' : 'manifest="cache.manifest"'
          }
        ),
        new CopyWebpackPlugin([
            {from: './public/img', to: 'img'},
            {from: './public/help', to: 'help'},
            {from: './public/wsInspector', to: 'wsInspector'},
            {from: './public/dashboard.md', to: 'dashboard.md'}
          ],
          {copyUnmodified: false}
        ),
        {
          apply: function(compiler){
            compiler.plugin('after-emit', function(compilation, callback) {
              console.log(' after-emit');
              if (true === env.dev) {
                  return callback();
              }
              console.log("Generating cache.manifest");

              // write marker so that gateway can know that ui was built
              fs.writeFileSync(`${BUILD_DIR}/build.timestamp`, `${timestamp}`);

              // write cache.manifest
              let manifest = `
CACHE MANIFEST
#${timestamp}

# Resources that require the user to be online.
NETWORK:
*

# Resources to cache
CACHE:
              `.trim() + "\n";

              ['%d.index.bundle.js', '%d.index.fonts.css', '%d.index.styles.css', 'img/%d.logo.png', 'fonts/%d.fontawesome-webfont.woff2'].forEach(function(name) {
                  manifest += util.format(name, timestamp) + "\n"
              });

              //console.log(manifest);
              fs.writeFileSync(`${BUILD_DIR}/cache.manifest`, manifest);

              callback();
            });
          }
        }
      ]
  }
};
