const path = require("path");

const ALLOWED_KEYS = new Set([
  "allowedHosts", "bonjour", "client", "compress", "devMiddleware",
  "headers", "historyApiFallback", "host", "hot", "ipc", "liveReload",
  "onListening", "open", "port", "proxy", "server", "app",
  "setupExitSignals", "setupMiddlewares", "static", "watchFiles", "webSocketServer"
]);

module.exports = {
  webpack: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  devServer: (devServerConfig) => {
    if (devServerConfig.https) {
      devServerConfig.server = "https";
    }

    Object.keys(devServerConfig).forEach((key) => {
      if (!ALLOWED_KEYS.has(key)) {
        delete devServerConfig[key];
      }
    });

    devServerConfig.setupMiddlewares = (middlewares, devServer) => {
      return middlewares;
    };

    return devServerConfig;
  },
};
