import { tanstackViteConfig } from '@tanstack/vite-config'

export default tanstackViteConfig({
  tsconfigPath: './tsconfig.build.json',
  entry: './src/index.ts',
  srcDir: './src',
})
