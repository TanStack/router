import { createFileRoute } from '@tanstack/solid-router'
import { useIntlayer } from 'solid-intlayer'

export const Route = createFileRoute('/{-$locale}/about')({
  component: About,
})

function About() {
  const content = useIntlayer('about-page')

  return (
    <main class="page-wrap px-4 py-12">
      <section class="island-shell rounded-2xl p-6 sm:p-8">
        <p class="island-kicker mb-2">{content.kicker}</p>
        <h1 class="display-title mb-3 text-4xl font-bold text-[var(--sea-ink)] sm:text-5xl">
          {content.title}
        </h1>
        <p class="m-0 max-w-3xl text-base leading-8 text-[var(--sea-ink-soft)]">
          {content.desc}
        </p>
      </section>
    </main>
  )
}
