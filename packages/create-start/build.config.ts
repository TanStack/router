import { defineBuildConfig } from 'unbuild'

// Separeate config required for dev because mkdist + cli-entry doesn't work
// with stub. It will create a .d.ts and .mjs file in the src folder
const dev = defineBuildConfig({
  entries: ['src/cli-entry'],
  outDir: 'dist',
  clean: true,
  declaration: true,
  rollup: {
    inlineDependencies: true,
    esbuild: {
      target: 'node18',
      minify: false,
    },
  },
})

const prod = defineBuildConfig({
  entries: [
    {
      builder: 'mkdist',
      cleanDist: true,
      input: './src/',
      pattern: ['**/*.{ts,tsx}', '!**/template/**'],
    },
  ],
  outDir: 'dist',
  clean: true,
  declaration: true,
  rollup: {
    inlineDependencies: true,
    esbuild: {
      target: 'node18',
      minify: false,
    },
  },
})

const config = process.env.BUILD_ENV === 'production' ? prod : dev
export default config
