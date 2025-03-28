import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/config/vite'
import angular from '@analogjs/vite-plugin-angular'
import packageJson from './package.json'
import type { UserConfig } from 'vitest/config'

const isTest = process.env['NODE_ENV'] === 'test';

const config = defineConfig({
  root: __dirname,
  plugins: [
    angular({ tsconfig: `${__dirname}/tsconfig.${isTest ? 'spec' : 'lib.prod' }.json`}),
    { name: 't',
      transform(code, id) {
        if (id.includes('.test')) {
          console.log(id, code);
        }
      }

    }
  ] as UserConfig['plugins'],
  test: {
    globals: true,
    name: packageJson.name,
    dir: './tests',
    watch: false,
    environment: 'jsdom',
    setupFiles: ['./tests/setup-tests.ts'],
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: 'tsconfig.lib.prod.json',
    outDir: 'dist/fesm2022',
    entry: './src/index.ts',
    srcDir: './src',
    cjs: false
  }),
)
