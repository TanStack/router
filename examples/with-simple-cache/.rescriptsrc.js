const path = require("path");
const resolveFrom = require("resolve-from");

const fixLinkedDependencies = (config) => {
  config.resolve = {
    ...config.resolve,
    alias: {
      ...config.resolve.alias,
      react$: resolveFrom(path.resolve("node_modules"), "react"),
      "react-dom$": resolveFrom(path.resolve("node_modules"), "react-dom"),
    },
  };
  return config;
};

module.exports = [fixLinkedDependencies];
