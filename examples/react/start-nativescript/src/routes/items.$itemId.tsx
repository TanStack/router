import { notFound } from '@tanstack/react-router'
import { createFileRoute, useBlocker } from '@tanstack/react-router'
import { useState } from 'react'
import { getCatalogItem } from '~/server/catalog'
import { ItemScreen } from '~/screens/ItemScreen'

const itemIds = ['router', 'start'] as const
type ItemId = (typeof itemIds)[number]

export const Route = createFileRoute('/items/$itemId')({
  loader: async ({ params }) => {
    if (!itemIds.includes(params.itemId as ItemId)) {
      throw notFound()
    }
    return getCatalogItem({ data: params.itemId as ItemId })
  },
  component: ItemRoute,
  native: ({ params }) => ({
    title: params.itemId === 'start' ? 'TanStack Start' : 'TanStack Router',
  }),
})

function ItemRoute() {
  const [backProtected, setBackProtected] = useState(false)
  useBlocker({
    disabled: !backProtected,
    shouldBlockFn: () => true,
  })

  return (
    <ItemScreen
      item={Route.useLoaderData()}
      backProtected={backProtected}
      onBackProtectedChange={setBackProtected}
    />
  )
}
