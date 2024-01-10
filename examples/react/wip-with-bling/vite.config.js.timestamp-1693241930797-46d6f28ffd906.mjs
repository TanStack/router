// vite.config.js
import { defineConfig } from "file:///Users/tannerlinsley/GitHub/router/node_modules/.pnpm/vite@4.4.9_@types+node@17.0.45/node_modules/vite/dist/node/index.js";
import react from "file:///Users/tannerlinsley/GitHub/router/node_modules/.pnpm/@vitejs+plugin-react@4.0.4_vite@4.4.9/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { bling } from "file:///Users/tannerlinsley/GitHub/bling/packages/bling/dist/vite.js";
var vite_config_default = defineConfig({
  plugins: [bling(), react()],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "use-sync-external-store",
      "@tanstack/bling"
    ]
  },
  build: {
    minify: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvdGFubmVybGluc2xleS9HaXRIdWIvcm91dGVyL2V4YW1wbGVzL3JlYWN0L3dpdGgtYmxpbmdcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy90YW5uZXJsaW5zbGV5L0dpdEh1Yi9yb3V0ZXIvZXhhbXBsZXMvcmVhY3Qvd2l0aC1ibGluZy92aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvdGFubmVybGluc2xleS9HaXRIdWIvcm91dGVyL2V4YW1wbGVzL3JlYWN0L3dpdGgtYmxpbmcvdml0ZS5jb25maWcuanNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJ1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xuaW1wb3J0IHsgYmxpbmcgfSBmcm9tICdAdGFuc3RhY2svYmxpbmcvdml0ZSdcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW2JsaW5nKCksIHJlYWN0KCldLFxuICByZXNvbHZlOiB7XG4gICAgZGVkdXBlOiBbXG4gICAgICAncmVhY3QnLFxuICAgICAgJ3JlYWN0LWRvbScsXG4gICAgICAndXNlLXN5bmMtZXh0ZXJuYWwtc3RvcmUnLFxuICAgICAgJ0B0YW5zdGFjay9ibGluZycsXG4gICAgXSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICBtaW5pZnk6IGZhbHNlLFxuICB9LFxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBc1csU0FBUyxvQkFBb0I7QUFDblksT0FBTyxXQUFXO0FBQ2xCLFNBQVMsYUFBYTtBQUV0QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxHQUFHLE1BQU0sQ0FBQztBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLFFBQVE7QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxFQUNWO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
