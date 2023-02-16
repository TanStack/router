import * as React from 'react'
import jsesc from 'jsesc'
import { hydrationContext } from './Hydrate'

export function Scripts() {
  const { dehydratedRouter, dehydratedLoaderClient } =
    React.useContext(hydrationContext)

  return (
    <>
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `
          window.__DEHYDRATED__ = JSON.parse(
            ${jsesc(
              JSON.stringify({
                dehydratedRouter,
                dehydratedLoaderClient,
              }),
              {
                isScriptContext: true,
                quotes: 'single',
                json: true,
              },
            )}
          )
        `,
        }}
      />
      <script type="module" src="/src/entry-client.tsx" />
    </>
  )
}
