import { createFileRoute } from '@tanstack/react-router'
import { ResponsiveImage } from '@responsive-image/react'
import { getImage } from '../images.ts'

export const Route = createFileRoute('/$imageId')({
  component: Image,
})

function Image() {
  const { imageId } = Route.useParams()
  const image = getImage(imageId)

  return <ResponsiveImage src={image} className="large"></ResponsiveImage>
}
