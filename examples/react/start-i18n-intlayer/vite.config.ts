import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { intlayer, intlayerProxy } from 'vite-intlayer';
import viteTsConfigPaths from 'vite-tsconfig-paths';

const config = defineConfig({
  plugins: [
    intlayerProxy(), // To redirect the user to his own locale. Should be placed before nitro
    nitro(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    intlayer(), // To make intlayer work
  ],
});

export default config;
