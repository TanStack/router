import { preOptimizeDevServer, waitForServer } from '@tanstack/router-e2e-utils'

export default async function setup() {
  const port = Number(process.env.E2E_APP_PORT ?? 0)
  const baseURL = `http://localhost:${port}`

  await waitForServer(baseURL)
  await preOptimizeDevServer({
    baseURL,
    warmup: async (page) => {
      await page.getByRole('heading').getByText('Welcome Home').waitFor()
      await page.goto(`${baseURL}/specialChars/search?searchParam=warmup`)
      await page.getByTestId('special-search-loaded-info').waitFor()
      await page.goto(`${baseURL}/posts`)
      await page.getByRole('link', { name: 'sunt aut facere repe' }).waitFor()
      await page.waitForLoadState('networkidle')
    },
  })
}
