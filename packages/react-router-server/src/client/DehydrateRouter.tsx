import { Context } from '@tanstack/react-cross-context'
import { useRouter } from '@tanstack/react-router'
import * as React from 'react'

export function DehydrateRouter() {
  const router = useRouter()

  const dehydratedCtx = React.useContext(
    Context.get('TanStackRouterHydrationContext', {}),
  )

  const dehydrated = router.dehydratedData || dehydratedCtx

  return (
    <script
      id="__TSR_DEHYDRATED__"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `
          window.__TSR_DEHYDRATED__ = {
            data: ${JSON.stringify(
              router.options.transformer.stringify(dehydrated),
            )}
          }
        `,
      }}
    />
  )
}
