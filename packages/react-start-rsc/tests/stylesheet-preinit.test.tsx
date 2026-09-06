import React from 'react'
import ReactDOM from 'react-dom'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompositeComponent } from '../src/CompositeComponent'
import { RscNodeRenderer } from '../src/RscNodeRenderer'
import {
  RSC_PROXY_GET_TREE,
  SERVER_COMPONENT_CSS_HREFS,
  SERVER_COMPONENT_JS_PRELOADS,
  SERVER_COMPONENT_STREAM,
} from '../src/ServerComponentTypes'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe.each(['node', 'composite'] as const)(
  '%s stylesheet rendering',
  (kind) => {
    it.each([
      { bundler: 'vite', environment: 'development', preinitCss: false },
      { bundler: 'vite', environment: 'production', preinitCss: true },
      { bundler: 'rsbuild', environment: 'development', preinitCss: true },
      { bundler: 'rsbuild', environment: 'production', preinitCss: true },
    ])(
      'renders assets in $bundler $environment',
      ({ bundler, environment, preinitCss }) => {
        vi.stubEnv('NODE_ENV', environment)
        if (bundler === 'vite') {
          vi.stubGlobal('TSS_VITE_RSC_DEV', environment === 'development')
        }
        const preinit = vi
          .spyOn(ReactDOM, 'preinit')
          .mockImplementation(() => {})
        const preloadModule = vi
          .spyOn(ReactDOM, 'preloadModule')
          .mockImplementation(() => {})
        const data = {
          [SERVER_COMPONENT_STREAM]: {
            createReplayStream: () => new ReadableStream(),
          },
          [RSC_PROXY_GET_TREE]: () => <div>Styled server content</div>,
          [SERVER_COMPONENT_CSS_HREFS]: new Set(['/assets/server.css']),
          [SERVER_COMPONENT_JS_PRELOADS]: new Set(['/assets/client.js']),
        }
        const html = renderToString(
          kind === 'node' ? (
            <RscNodeRenderer data={data} />
          ) : (
            <CompositeComponent src={data as any} />
          ),
        )

        expect(html).toContain('Styled server content')
        if (preinitCss) {
          expect(preinit).toHaveBeenCalledExactlyOnceWith(
            '/assets/server.css',
            {
              as: 'style',
              precedence: 'high',
            },
          )
        } else {
          expect(preinit).not.toHaveBeenCalled()
        }
        expect(preloadModule).toHaveBeenCalledExactlyOnceWith(
          '/assets/client.js',
        )
      },
    )
  },
)
