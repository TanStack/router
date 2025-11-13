import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Typography } from '@mui/material'
import { Suspense } from 'react'

const aboutQueryOptions = {
  queryKey: ['about'],
  queryFn: () =>
    new Promise((resolve) => setTimeout(() => resolve('Data!'), 1000)),
}

export const Route = createFileRoute('/about')({
  loader: ({ context }) => {
    // Prefetch without awaiting to enable streaming
    context.queryClient.prefetchQuery(aboutQueryOptions)
  },

  component: RouteComponent,
})

function RouteComponent() {
  return (
    <>
      <Typography variant="h2">About</Typography>
      <Suspense fallback={<AboutLoading />}>
        <AboutData />
      </Suspense>
    </>
  )
}

function AboutLoading() {
  return (
    <Typography variant="body1" sx={{ color: 'text.secondary' }}>
      Loading data...
    </Typography>
  )
}

function AboutData() {
  const query = useSuspenseQuery(aboutQueryOptions)
  return (
    <Typography variant="body1" sx={{ color: '#357a38' }}>
      Data loaded!
    </Typography>
  )
}
