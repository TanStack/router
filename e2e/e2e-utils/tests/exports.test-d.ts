import { preOptimizeDevServer, test } from '@tanstack/router-e2e-utils'

test.use({ whitelistErrors: ['expected error', /expected pattern/] })

// @ts-expect-error Error filters must be strings or regular expressions.
test.use({ whitelistErrors: [123] })

void preOptimizeDevServer({
  baseURL: 'http://localhost:3000',
  warmup: async (page) => {
    await page.getByRole('link', { name: 'Home' }).click()
  },
})
