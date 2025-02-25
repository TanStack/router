// vite.config.ts
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { TanStackStartVitePlugin } from "@tanstack/start/plugin";
var vite_config_default = defineConfig({
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"]
    }),
    TanStackStartVitePlugin()
  ]
});
export {
  vite_config_default as default
};
