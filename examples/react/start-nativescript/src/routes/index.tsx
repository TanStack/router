import { createFileRoute } from '@tanstack/react-router'
import { getWelcome } from '~/server/catalog'
import { HomeScreen } from '~/screens/HomeScreen'

export const Route = createFileRoute('/')({
  loader: () => getWelcome(),
  component: HomeRoute,
  native: {
    title: 'TanStack Native',
    headerLargeTitle: true,
  },
})

function HomeRoute() {
  return <HomeScreen welcome={Route.useLoaderData()} />
}
