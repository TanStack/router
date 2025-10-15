import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Typography } from '@mui/material'
import { Suspense } from 'react'

const isStreaming = true

const aboutQueryOptions = {
  queryKey: ['about'],
  queryFn: () =>
    new Promise((resolve) => setTimeout(() => resolve('Data!'), 1000)),
}

export const Route = createFileRoute('/about')({
  loader: async ({ context }) => {
    const prefetch = context.queryClient.prefetchQuery(aboutQueryOptions)

    // To demonstrate streaming, we return without awaiting.
    // To demonstrate prefetching without streaming, we await the prefetch.
    if (!isStreaming) {
      await prefetch
    }
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
  useSuspenseQuery(aboutQueryOptions)
  return (
    <Typography variant="body1" sx={{ color: '#357a38' }}>
      Data loaded!
    </Typography>
  )
}
