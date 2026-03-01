import { defineConfig } from 'vite'
import angular from '@analogjs/vite-plugin-angular'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({
      target: 'angular',
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    angular({
      tsconfig: './tsconfig.json',
    }),
  ],
})
