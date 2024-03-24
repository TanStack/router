import {
  getRenderedMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import * as React from 'react'
import { DehydrateRouter } from './DehydrateRouter'
import { RouterManagedTag } from './RouterManagedTag'
import { Asset } from './Asset'

export const Scripts = () => {
  const router = useRouter()

  const manifestScripts =
    (router.options.context?.assets.filter(
      (d: any) => d.tag === 'script',
    ) as RouterManagedTag[]) ?? []

  const { scripts } = useRouterState({
    select: (state) => ({
      scripts: getRenderedMatches(state)
        .map((match) => match.scripts!)
        .filter(Boolean)
        .flat(1)
        .map(({ children, ...script }) => ({
          tag: 'script',
          attrs: {
            ...script,
            suppressHydrationWarning: true,
            key: `script-${script.src}`,
          },
          children,
        })),
    }),
  })

  const allScripts = [...scripts, ...manifestScripts] as RouterManagedTag[]

  return (
    <>
      <DehydrateRouter />
      {allScripts.map((asset, i) => (
        <Asset {...asset} key={i} />
      ))}
    </>
  )
}
