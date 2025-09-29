const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

/**
 * Webpack 配置用于构建 VS Code 扩展
 * 支持多入口点和资源文件复制
 */
module.exports = {
  mode: 'production',

  // 多个入口点
  entry: {
    extension: './src/extension.ts',
    'webview/markets': './src/webview/markets.ts',
    'webview/positions': './src/webview/positions.ts',
    'webview/types': './src/webview/types.ts'
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    clean: true // 构建前清理输出目录
  },

  target: 'node', // VS Code 扩展运行在 Node.js 环境

  resolve: {
    extensions: ['.ts', '.js'],
    mainFields: ['main', 'module']
  },

  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json'
          }
        }
      }
    ]
  },

  externals: {
    // VS Code API 不应该被打包
    vscode: 'commonjs vscode',
    // CCXT 的可选依赖项，在 Node.js 环境中标记为外部
    'bufferutil': 'commonjs bufferutil',
    'utf-8-validate': 'commonjs utf-8-validate',
    'http-proxy-agent': 'commonjs http-proxy-agent',
    'https-proxy-agent': 'commonjs https-proxy-agent',
    'socks-proxy-agent': 'commonjs socks-proxy-agent',
    'protobufjs/minimal': 'commonjs protobufjs/minimal'
  },

  plugins: [
    // 复制静态资源文件
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/webview/*.html',
          to: 'webview/[name][ext]'
        },
        {
          from: 'src/webview/*.css',
          to: 'webview/[name][ext]'
        },
        {
          from: 'src/assets',
          to: 'assets'
        }
      ]
    })
  ],

  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          chunks: 'all',
          priority: 10,
          enforce: true
        }
      }
    },
    // 启用代码压缩
    minimize: true
  },

  // 性能提示配置
  performance: {
    hints: false // 禁用性能提示，VS Code 扩展通常较小
  }
};