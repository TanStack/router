import { createFileRoute } from '@tanstack/react-router'
import { getCssModulesCardServerComponent } from '~/utils/cssModulesCardServerComponent'

export const Route = createFileRoute('/rsc-hmr-css-modules')({
  loader: async () => {
    const Server = await getCssModulesCardServerComponent()
    return { Server }
  },
  component: RscHmrCssModules,
})

function RscHmrCssModules() {
  const { Server } = Route.useLoaderData()
  return <>{Server}</>
}
