import { createFileRoute, notFound } from '@tanstack/react-router'
import { ResponsiveImage } from '@responsive-image/react'
import { getImage, hasImage } from '../images'

export const Route = createFileRoute('/$imageId')({
  loader: ({ params }) => {
    if (!hasImage(params.imageId)) {
      throw notFound()
    }

    return params.imageId
  },
  component: Image,
})

function Image() {
  const imageId = Route.useLoaderData()
  const image = getImage(imageId)

  return <ResponsiveImage src={image} className="large" />
}
