import { Typography } from '@mui/material'

export const Route = createFileRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return <Typography variant="h2">About</Typography>
}
