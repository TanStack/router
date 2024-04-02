import {
  getRenderedMatches,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import * as React from 'react'
import { DehydrateRouter } from './DehydrateRouter'
import { Asset } from './Asset'
import type { RouterManagedTag } from './RouterManagedTag'

export const Scripts = () => {
  const router = useRouter()

  const manifestScripts =
    (
      router.options.context?.assets.filter((d: any) => d.tag === 'script') as
        | Array<RouterManagedTag>
        | undefined
    )?.map(({ tag, children, attrs }) => {
      const { key, ...rest } = attrs || {}
      return {
        tag,
        attrs: rest,
        children,
      }
    }) ?? []

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
          },
          children,
        })),
    }),
  })

  const allScripts = [...scripts, ...manifestScripts] as Array<RouterManagedTag>

  return (
    <>
      <DehydrateRouter />
      {allScripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
