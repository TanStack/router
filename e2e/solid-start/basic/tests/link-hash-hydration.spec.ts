import { expect, test } from '@playwright/test'

test('hash-dependent links reproduce the server state before using the browser hash', async ({
  page,
}) => {
  test.skip(process.env.MODE === 'spa', 'Requires server-rendered links')
  const errors: Array<string> = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (/hydration|mismatch/i.test(message.text())) {
      errors.push(message.text())
    }
  })
  let releaseScripts!: () => void
  const scripts = new Promise<void>((resolve) => {
    releaseScripts = resolve
  })
  await page.route('**/*.js', async (route) => {
    await scripts
    await route.continue()
  })
  const path = '/link-hash-hydration'
  const cases = [
    {
      id: 'explicit-source',
      server: ['#preset', false],
      client: ['#preset', false],
    },
    {
      id: 'explicit-source-function',
      server: ['#preset-child', false],
      client: ['#preset-child', false],
    },
    {
      id: 'explicit-href',
      server: ['#fixed', false],
      client: ['#fixed', false],
    },
    { id: 'matching', server: ['#details', false], client: ['#details', true] },
    { id: 'nonmatching', server: ['#other', false], client: ['#other', false] },
    { id: 'empty', server: ['', true], client: ['', false] },
    { id: 'omitted', server: ['', true], client: ['', false] },
    { id: 'inherited', server: ['', true], client: ['#details', true] },
    { id: 'identity', server: ['', true], client: ['#details', true] },
    {
      id: 'derived',
      server: ['#-child', false],
      client: ['#details-child', false],
    },
    {
      id: 'inherited-insensitive',
      server: ['', true],
      client: ['#details', true],
    },
    {
      id: 'derived-insensitive',
      server: ['#-child', true],
      client: ['#details-child', true],
    },
    { id: 'ordinary', server: ['', true], client: ['', true] },
  ] as const
  await page.goto(`${path}#details`, { waitUntil: 'commit' })
  try {
    for (const entry of cases) {
      const anchor = page.locator(`#${entry.id}`)
      await expect(anchor).toHaveAttribute('href', path + entry.server[0])
      await expect(anchor).toHaveText(entry.server[1] ? 'active' : 'inactive')
      if (entry.server[1]) {
        await expect(anchor).toHaveAttribute('aria-current', 'page')
        await expect(anchor).toHaveAttribute('data-status', 'active')
      } else {
        await expect(anchor).not.toHaveAttribute('aria-current')
        await expect(anchor).not.toHaveAttribute('data-status')
      }
    }
    await page.evaluate(() => {
      const anchors = Array.from(
        document.querySelectorAll('[data-testid="hash-links"] a'),
      )
      ;(window as any).serverHashLinks = anchors
    })
  } finally {
    releaseScripts()
  }
  await expect(page.getByTestId('hash-links')).toHaveAttribute(
    'data-mounted',
    'true',
  )
  const initial = await page.evaluate(() => window.initialHashLinks)
  for (const entry of cases) {
    expect(initial[entry.id], entry.id).toEqual({
      href: path + entry.server[0],
      active: entry.server[1],
    })
    const anchor = page.locator(`#${entry.id}`)
    await expect(anchor).toHaveAttribute('href', path + entry.client[0])
    await expect(anchor).toContainClass(entry.client[1] ? 'active' : 'inactive')
    await expect(anchor).toHaveText(entry.client[1] ? 'active' : 'inactive')
    if (entry.client[1]) {
      await expect(anchor).toHaveAttribute('aria-current', 'page')
      await expect(anchor).toHaveAttribute('data-status', 'active')
    } else {
      await expect(anchor).not.toHaveAttribute('aria-current')
      await expect(anchor).not.toHaveAttribute('data-status')
    }
    await expect(
      anchor.locator(entry.client[1] ? 'strong' : 'em'),
    ).toBeVisible()
  }
  expect(
    await page.evaluate(() =>
      (window as any).serverHashLinks.every(
        (anchor: Element) => document.getElementById(anchor.id) === anchor,
      ),
    ),
  ).toBe(true)
  await page.getByRole('button', { name: 'Mount link' }).click()
  expect(await page.evaluate(() => window.initialHashLinks.later)).toEqual({
    href: `${path}#details`,
    active: true,
  })
  await page.getByRole('button', { name: 'Toggle hash matching' }).click()
  await expect(page.locator('#empty')).toContainClass('active')
  await expect(page.locator('#nonmatching')).toContainClass('active')
  await page.getByRole('button', { name: 'Toggle hash matching' }).click()
  await expect(page.locator('#empty')).toContainClass('inactive')
  await page.locator('#navigate-other').click()
  await expect(page.locator('#matching')).toContainClass('inactive')
  await expect(page.locator('#nonmatching')).toContainClass('active')
  await expect(page.locator('#inherited')).toHaveAttribute(
    'href',
    `${path}#other`,
  )
  await expect(page.locator('#derived')).toHaveAttribute(
    'href',
    `${path}#other-child`,
  )
  expect(errors).toEqual([])
})
