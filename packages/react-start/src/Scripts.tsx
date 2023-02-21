import * as React from 'react'
// import jsesc from 'jsesc'
import { hydrationContext } from './Hydrate'

export function Scripts() {
  const dehydrated = React.useContext(hydrationContext)

  return (
    <>
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `
          window.__DEHYDRATED__ = 
           ${
             JSON.stringify(dehydrated)
             // {
             //   isScriptContext: true,
             //   quotes: 'single',
             //   json: true,
             // },
           }
        `,
        }}
      />
      <script type="module" src="/src/app/entry-client.tsx" />
    </>
  )
}
