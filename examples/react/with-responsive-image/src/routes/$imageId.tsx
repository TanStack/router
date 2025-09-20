import { createFileRoute } from '@tanstack/react-router'
import { ResponsiveImage } from '@responsive-image/react'
import { getImage } from '../images.ts'

export const Route = createFileRoute('/$imageId')({
  loader: ({ params }) => getImage(params.imageId),
  component: Image,
})

function Image() {
  const image = Route.useLoaderData()

  return <ResponsiveImage src={image} className="large" />
}
