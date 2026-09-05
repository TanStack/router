import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import codspeedPlugin from '@codspeed/vitest-plugin'
import { memoryExecArgv } from '../../runtime'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [codspeedPlugin()],
  test: {
    watch: false,
    environment: 'node',
    execArgv: memoryExecArgv(),
  },
})
