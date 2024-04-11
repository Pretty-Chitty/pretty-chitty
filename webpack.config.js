const path = require("path");
const webpack = require("webpack");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const ReactRefreshWebpackPlugin = require("@pmmmwh/react-refresh-webpack-plugin");

const isDevelopment = process.env.NODE_ENV !== "production";

module.exports = {
  mode: isDevelopment ? "development" : "production",

  entry: isDevelopment ? "./src/index.tsx" : "./src/library/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    umdNamedDefine: true,
    library: "pretty-chitty",
    libraryTarget: "umd",
    filename: "pretty-chitty.js",
  },
  plugins: [
    ...[
      isDevelopment && new ReactRefreshWebpackPlugin(),
      isDevelopment && new webpack.HotModuleReplacementPlugin(),
      isDevelopment &&
        new HtmlWebpackPlugin({
          template: "./src/index.html", // Path to your index.html file
        }),
    ].filter(Boolean),
    ,
  ],
  devtool: "source-map",
  devServer: {
    static: "./dist",
    hot: true,
    liveReload: false,
    devMiddleware: { writeToDisk: true },
    allowedHosts: "all",
    compress: true,
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js)$/,
        use: {
          loader: "babel-loader",
          options: {
            plugins: [
              // "@babel/plugin-transform-typescript",
              // ["@babel/plugin-syntax-decorators", { legacy: true }],
              isDevelopment && require.resolve("react-refresh/babel"),

              "babel-plugin-transform-typescript-metadata",
              ["@babel/plugin-proposal-decorators", { legacy: true }],
              ["@babel/plugin-proposal-class-properties", { loose: true }],
              // ["@babel/plugin-proposal-decorators", { version: "2023-05" }],
            ].filter(Boolean),

            sourceMaps: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        test: /(\.svg)|(inline\.png)|(inline\.jpg)/,
        type: "asset/inline",
      },
      {
        test: /\.(png)|(jpg)/,
        exclude: /(inline\.png)|(inline\.jpg)/,
        type: "asset/resource",
      },
      {
        test: /\.(css|sass|scss)$/,
        use: [
          {
            loader: "style-loader",
          },
          {
            loader: "css-loader",
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
};
