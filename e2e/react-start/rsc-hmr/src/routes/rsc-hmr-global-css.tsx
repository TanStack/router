import { createFileRoute } from '@tanstack/react-router'
import { getGlobalCssCardServerComponent } from '~/utils/globalCssCardServerComponent'

export const Route = createFileRoute('/rsc-hmr-global-css')({
  loader: async () => {
    const Server = await getGlobalCssCardServerComponent()
    return { Server }
  },
  component: RscHmrGlobalCss,
})

function RscHmrGlobalCss() {
  const { Server } = Route.useLoaderData()
  return <>{Server}</>
}
