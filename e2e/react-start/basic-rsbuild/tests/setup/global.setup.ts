import {
  e2eStartDummyServer,
  getTestServerPort,
  preOptimizeDevServer,
  waitForServer,
} from '@tanstack/router-e2e-utils'
import packageJson from '../../package.json' with { type: 'json' }

export default async function setup() {
  await e2eStartDummyServer(packageJson.name)

  if (process.env.MODE !== 'dev') return

  const port = await getTestServerPort(packageJson.name)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)
  await preOptimizeDevServer({
    baseURL,
    readyTestId: 'home-heading',
    warmup: async (page) => {
      // Visit home page
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('home-heading').waitFor({ state: 'visible' })
      await page.waitForLoadState('networkidle')

      // Visit server-fns page (triggers lazy compilation of that route)
      await page.goto(`${baseURL}/server-fns`, {
        waitUntil: 'domcontentloaded',
      })
      await page.getByTestId('server-fns-heading').waitFor({ state: 'visible' })
      await page.waitForLoadState('networkidle')

      // Client-side navigation back to home
      await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' })
      await page.getByTestId('home-heading').waitFor({ state: 'visible' })
      await page.waitForLoadState('networkidle')

      // Client-side navigation to server-fns
      await page.getByText('Server Functions').click()
      await page.waitForURL('**/server-fns')
      await page.getByTestId('server-fns-heading').waitFor({ state: 'visible' })
      await page.waitForLoadState('networkidle')
    },
  })
}
