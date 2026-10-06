import { createFileRoute } from '@tanstack/react-router'

const { title, subtitle } = getCopy()

export { title }

export const Route = createFileRoute('/')({
  component: () => (
    <div>
      {title} {subtitle}
    </div>
  ),
})

function getCopy() {
  return { title: 'Title', subtitle: 'Subtitle' }
}
