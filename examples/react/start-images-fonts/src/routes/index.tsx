import { createFileRoute } from '@tanstack/react-router'
import small from '../assets/coast-480.webp'
import medium from '../assets/coast-960.webp'
import large from '../assets/coast-1600.webp'
export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Coastal field notes' },
      {
        name: 'description',
        content:
          'An illustrated coast with responsive images and a self-hosted variable font.',
      },
    ],
  }),
  component: Page,
})
function Page() {
  return (
    <main>
      <h1>Coastal field notes</h1>
      <img
        src={medium}
        srcSet={`${small} 480w, ${medium} 960w, ${large} 1600w`}
        sizes="(min-width: 992px) 960px, calc(100vw - 32px)"
        width={1600}
        height={900}
        fetchPriority="high"
        loading="eager"
        alt="A lighthouse above layered blue cliffs and a quiet bay"
      />
      <p>The last light catches the headland before the tide turns.</p>
    </main>
  )
}
