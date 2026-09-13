import 'dotenv/config'
import { defineConfig } from '@playwright/test'

const checkpoints = [
  { name: '01-setup', port: 3140, testMatch: 'setup.spec.ts' },
  { name: '02-routes', port: 3141, testMatch: 'routes.spec.ts' },
  { name: '03-data', port: 3142, testMatch: 'data.spec.ts' },
  { name: '04-forms', port: 3143, testMatch: 'forms.spec.ts' },
  { name: '06-seo', port: 3145, testMatch: 'seo.spec.ts' },
  { name: '07-deployment', port: 3146, testMatch: 'deployment.spec.ts' },
  { name: '08-tests', port: 3147, testMatch: 'final-*.spec.ts' },
  {
    name: '05-authentication',
    port: 3144,
    testMatch: 'authentication.spec.ts',
  },
]
const requested = process.env.COURSE_CHECKPOINT ?? '01-setup'
const checkpoint = checkpoints.find((item) => item.name === requested)
if (!checkpoint) {
  throw new Error(`Unknown course checkpoint: ${requested}`)
}
const production = process.env.COURSE_PRODUCTION === '1'
const baseURL = `http://localhost:${checkpoint.port}`

export default defineConfig({
  testDir: './tests',
  use: { browserName: 'chromium', baseURL },
  projects: [{ name: checkpoint.name, testMatch: checkpoint.testMatch }],
  webServer: {
    command: production
      ? `PORT=${checkpoint.port} node checkpoints/${checkpoint.name}/.output/server/index.mjs`
      : `pnpm exec vite checkpoints/${checkpoint.name} --port ${checkpoint.port}`,
    url: baseURL,
    env: { APP_ORIGIN: baseURL },
    timeout: 120_000,
  },
})
