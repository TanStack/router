import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'

test('CSP header is set with nonce', async ({ page }) => {
  const response = await page.goto('/')
  const csp = response?.headers()['content-security-policy']
  expect(csp).toContain("script-src 'self' 'nonce-")
  expect(csp).toContain("style-src 'self' 'nonce-")
})

test('Inline scripts have nonce attribute', async ({ page }) => {
  await page.goto('/')
  const scripts = await page.locator('script[nonce]').all()
  expect(scripts.length).toBeGreaterThan(0)
})

test('Inline styles have nonce attribute', async ({ page }) => {
  await page.goto('/')
  const styles = await page.locator('style[nonce]').all()
  expect(styles.length).toBeGreaterThan(0)
})

test('External script has nonce attribute', async ({ page }) => {
  await page.goto('/')
  const externalScript = page.locator('script[src="/external.js"]')
  await expect(externalScript).toHaveAttribute('nonce')
})

test('External stylesheet has nonce attribute', async ({ page }) => {
  await page.goto('/')
  const externalStylesheet = page.locator('link[href="/external.css"]')
  await expect(externalStylesheet).toHaveAttribute('nonce')
})

test('Nonces match between header and elements', async ({ page }) => {
  // Intercept the HTML response to get raw content before browser strips nonces
  let rawHtml = ''
  await page.route('/', async (route) => {
    const response = await route.fetch()
    rawHtml = await response.text()
    await route.fulfill({ response })
  })

  const response = await page.goto('/')
  await page.unrouteAll({ behavior: 'ignoreErrors' })

  const csp = response?.headers()['content-security-policy'] || ''

  // Extract nonce from CSP header
  const nonceMatch = csp.match(/nonce-([a-f0-9]+)/)
  expect(nonceMatch).toBeTruthy()
  const headerNonce = nonceMatch![1]

  // Check script nonces match - look for nonce attribute anywhere in the script tag
  const scriptNonces = [
    ...rawHtml.matchAll(/<script[^>]*\bnonce="([^"]+)"[^>]*>/g),
  ].map((m) => m[1])
  expect(scriptNonces.length).toBeGreaterThan(0)
  for (const nonce of scriptNonces) {
    expect(nonce).toBe(headerNonce)
  }

  // Check style nonces match
  const styleNonces = [
    ...rawHtml.matchAll(/<style[^>]*\bnonce="([^"]+)"[^>]*>/g),
  ].map((m) => m[1])
  expect(styleNonces.length).toBeGreaterThan(0)
  for (const nonce of styleNonces) {
    expect(nonce).toBe(headerNonce)
  }

  // Check external script nonce matches (nonce can be before or after src)
  const externalScriptMatch = rawHtml.match(
    /<script[^>]*\bsrc="\/external\.js"[^>]*\bnonce="([^"]+)"[^>]*>|<script[^>]*\bnonce="([^"]+)"[^>]*\bsrc="\/external\.js"[^>]*>/,
  )
  expect(externalScriptMatch).toBeTruthy()
  expect(externalScriptMatch![1] || externalScriptMatch![2]).toBe(headerNonce)

  // Check external stylesheet nonce matches (nonce can be before or after href)
  const externalStyleMatch = rawHtml.match(
    /<link[^>]*\bhref="\/external\.css"[^>]*\bnonce="([^"]+)"[^>]*>|<link[^>]*\bnonce="([^"]+)"[^>]*\bhref="\/external\.css"[^>]*>/,
  )
  expect(externalStyleMatch).toBeTruthy()
  expect(externalStyleMatch![1] || externalStyleMatch![2]).toBe(headerNonce)
})

test('Hydration works - counter increments', async ({ page }) => {
  const cspViolations: any[] = []
  // page.on handlers must be registered before navigation
  page.on('console', (msg) => {
    if (msg.text().toLowerCase().includes('content security policy')) {
      cspViolations.push({
        type: msg.type(),
        text: msg.text(),
        location: msg.location?.(),
      })
    }
  })

  // Capture raw SSR HTML (includes nonces) and CSP header
  let rawHtml = ''
  let cspHeader = ''
  await page.route('/', async (route) => {
    const response = await route.fetch()
    cspHeader = response.headers()['content-security-policy'] || ''
    rawHtml = await response.text()
    await route.fulfill({ response })
  })

  await page.addInitScript(() => {
    const record = (window as any).__CSP_STYLE_MUTATIONS__
      ? (window as any).__CSP_STYLE_MUTATIONS__
      : ((window as any).__CSP_STYLE_MUTATIONS__ = [])

    window.addEventListener(
      'securitypolicyviolation',
      (e) => {
        record.push({
          kind: 'securitypolicyviolation',
          blockedURI: e.blockedURI,
          effectiveDirective: e.effectiveDirective,
          violatedDirective: e.violatedDirective,
          originalPolicy: e.originalPolicy,
          sample: e.sample,
          disposition: e.disposition,
          documentURI: e.documentURI,
          lineNumber: e.lineNumber,
          columnNumber: e.columnNumber,
          sourceFile: e.sourceFile,
          statusCode: e.statusCode,
        })
      },
      true,
    )

    const originalSetAttribute = Element.prototype.setAttribute
    Element.prototype.setAttribute = function (name: string, value: string) {
      if (name === 'style') {
        record.push({
          kind: 'setAttribute',
          tagName: (this as any).tagName,
          id: (this as any).id,
          className: (this as any).className,
          testId: (this as any).getAttribute?.('data-testid'),
          value,
          stack: new Error('setAttribute style').stack,
        })
      }
      return originalSetAttribute.call(this, name, value)
    }

    const originalCssText = Object.getOwnPropertyDescriptor(
      CSSStyleDeclaration.prototype,
      'cssText',
    )
    if (originalCssText?.set) {
      Object.defineProperty(CSSStyleDeclaration.prototype, 'cssText', {
        get: originalCssText.get,
        set(value) {
          record.push({
            kind: 'cssText',
            value,
            stack: new Error('cssText set').stack,
          })
          return originalCssText.set!.call(this, value)
        },
      })
    }

    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty
    CSSStyleDeclaration.prototype.setProperty = function (...args) {
      record.push({
        kind: 'setProperty',
        args,
        stack: new Error('setProperty').stack,
      })
      return originalSetProperty.apply(this, args as any)
    }

    const originalInsertRule = CSSStyleSheet.prototype.insertRule
    CSSStyleSheet.prototype.insertRule = function (...args) {
      record.push({
        kind: 'insertRule',
        args,
        stack: new Error('insertRule').stack,
      })
      return originalInsertRule.apply(this, args as any)
    }

    const originalCreateElement = Document.prototype.createElement
    Document.prototype.createElement = function (...args: any[]) {
      const el = originalCreateElement.apply(this, args as any)
      if (String(args[0]).toLowerCase() === 'style') {
        record.push({
          kind: 'createStyle',
          nonce:
            (el as any).nonce ?? (el as any).getAttribute?.('nonce') ?? null,
          stack: new Error('create style').stack,
        })

        const originalTextContent = Object.getOwnPropertyDescriptor(
          Node.prototype,
          'textContent',
        )
        const originalSetTextContent = originalTextContent?.set

        if (originalSetTextContent) {
          try {
            Object.defineProperty(el, 'textContent', {
              get: originalTextContent!.get,
              set(value) {
                record.push({
                  kind: 'styleTextContent',
                  value,
                  stack: new Error('style textContent').stack,
                })
                return originalSetTextContent.call(this, value)
              },
            })
          } catch {
            // ignore if non-configurable
          }
        }
      }
      return el
    }

    const originalAppendChild = Node.prototype.appendChild
    Node.prototype.appendChild = function (child: any) {
      if (child?.tagName === 'STYLE' || child?.nodeName === 'STYLE') {
        record.push({
          kind: 'appendStyle',
          nonce: (child as any).nonce ?? child.getAttribute?.('nonce') ?? null,
          text: child.textContent,
          stack: new Error('append style').stack,
        })
      }
      return originalAppendChild.call(this, child) as any
    }

    const originalInsertBefore = Node.prototype.insertBefore
    Node.prototype.insertBefore = function (newNode: any, referenceNode: any) {
      if (newNode?.tagName === 'STYLE' || newNode?.nodeName === 'STYLE') {
        record.push({
          kind: 'insertBeforeStyle',
          text: newNode.textContent,
          stack: new Error('insertBefore style').stack,
        })
      }
      return originalInsertBefore.call(this, newNode, referenceNode) as any
    }
  })

  const response = await page.goto('/')
  await page.unrouteAll({ behavior: 'ignoreErrors' })

  // Sanity check: SSR should already include the route-head inline style tag with a nonce.
  // If this is present, Vue should not need to re-insert a <style> element during hydration.
  const nonceMatch = (
    cspHeader ||
    response?.headers()['content-security-policy'] ||
    ''
  ).match(/nonce-([a-f0-9]+)/)
  expect(nonceMatch).toBeTruthy()
  const headerNonce = nonceMatch![1]

  const ssrHasInlineStyledCss = /\.inline-styled\s*\{/.test(rawHtml)
  const ssrHasNonceStyleTag = new RegExp(
    `<style[^>]*\\bnonce=\"${headerNonce}\"[^>]*>[\\s\\S]*?\\.inline-styled[\\s\\S]*?<\\/style>`,
  ).test(rawHtml)

  if (!ssrHasInlineStyledCss || !ssrHasNonceStyleTag) {
    // eslint-disable-next-line no-console
    console.log('Hydration SSR checks', {
      headerNonce,
      ssrHasInlineStyledCss,
      ssrHasNonceStyleTag,
      cspHeader: cspHeader || response?.headers()['content-security-policy'],
    })
    throw new Error(
      'SSR HTML is missing the nonce style tag for .inline-styled; hydration will necessarily attempt insertion',
    )
  }

  await expect(page.getByTestId('counter-value')).toContainText('0')

  // Keep clicking until Vue hydrates and the counter increments
  // This handles the race between test execution and hydration
  let counterText: string | null = '0'
  try {
    await expect
      .poll(
        async () => {
          await page.getByTestId('counter-btn').click()
          return page.getByTestId('counter-value').textContent()
        },
        { timeout: 10000, intervals: [100, 200, 500, 1000] },
      )
      .not.toBe('0')
  } catch {
    counterText = await page.getByTestId('counter-value').textContent()
    const styleMutations = await page.evaluate(
      () => (window as any).__CSP_STYLE_MUTATIONS__ || [],
    )
    const nonceProbe = await page.evaluate(() => {
      const s = document.querySelector('style[nonce],script[nonce],link[nonce]')
      return {
        found: Boolean(s),
        attr: s?.getAttribute('nonce') ?? null,
        prop: (s as any)?.nonce ?? null,
        tag: s?.tagName ?? null,
        patchInstalled: Boolean((window as any).__TSR_NONCE_PATCH_INSTALLED__),
        ssrNonce: (window as any).__TSR_SSR_NONCE__ ?? null,
      }
    })
    // eslint-disable-next-line no-console
    console.log('Hydration counterText', counterText)
    // eslint-disable-next-line no-console
    console.log('Nonce probe', nonceProbe)
    // eslint-disable-next-line no-console
    console.log('CSP style mutations', styleMutations)
    // eslint-disable-next-line no-console
    console.log('CSP console msgs', cspViolations)
    throw new Error('Hydration failed (see logged style mutations)')
  }

  // Now that hydration is confirmed, verify further increments work
  const currentValue = parseInt(
    (await page.getByTestId('counter-value').textContent()) || '0',
  )
  await page.getByTestId('counter-btn').click()
  await expect(page.getByTestId('counter-value')).toContainText(
    String(currentValue + 1),
  )
})

test('Inline styles work with CSP', async ({ page }) => {
  await page.goto('/')
  const el = page.getByTestId('inline-styled')
  await expect(el).toBeVisible()
  // Verify the style was applied (green color)
  const color = await el.evaluate((e) => getComputedStyle(e).color)
  expect(color).toBe('rgb(0, 128, 0)') // green
})

test('External styles work with CSP', async ({ page }) => {
  await page.goto('/')
  const el = page.getByTestId('external-styled')
  await expect(el).toBeVisible()
  // Verify the style was applied (blue color)
  const color = await el.evaluate((e) => getComputedStyle(e).color)
  expect(color).toBe('rgb(0, 0, 255)') // blue
})

test('External script executes with CSP', async ({ page }) => {
  await page.goto('/')
  // Check that the external script set its window global
  await expect
    .poll(() => page.evaluate(() => (window as any).__EXTERNAL_SCRIPT_LOADED__))
    .toBe(true)
})

test('No CSP violations in console', async ({ page }) => {
  const violations: string[] = []
  page.on('console', (msg) => {
    if (msg.text().toLowerCase().includes('content security policy')) {
      violations.push(msg.text())
    }
  })
  page.on('pageerror', (err) => {
    if (err.message.toLowerCase().includes('content security policy')) {
      violations.push(err.message)
    }
  })
  await page.goto('/')
  await page.getByTestId('counter-btn').click()
  // Small wait to ensure any async violations are caught
  await page.waitForTimeout(100)
  expect(violations).toEqual([])
})

test('Each request gets a unique nonce', async ({ page }) => {
  const response1 = await page.goto('/')
  const csp1 = response1?.headers()['content-security-policy'] || ''
  const nonce1 = csp1.match(/nonce-([a-f0-9]+)/)?.[1]

  const response2 = await page.goto('/')
  const csp2 = response2?.headers()['content-security-policy'] || ''
  const nonce2 = csp2.match(/nonce-([a-f0-9]+)/)?.[1]

  expect(nonce1).toBeTruthy()
  expect(nonce2).toBeTruthy()
  expect(nonce1).not.toBe(nonce2)
})
