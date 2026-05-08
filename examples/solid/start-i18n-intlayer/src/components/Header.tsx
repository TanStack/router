import { Link } from './LocalizedLink'
import { useIntlayer } from 'solid-intlayer'
import { LocaleSwitcher } from './LocaleSwitcher'

export default function Header() {
  const content = useIntlayer('header')

  return (
    <header class="site-header px-4">
      <nav class="page-wrap nav-shell relative">
        <h2 class="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
          <Link to="/" class="brand-pill">
            {content.tanstack}
            <span>+</span>

            <span class="text-neutral">{content.intlayer}</span>
          </Link>
        </h2>

        <div class="absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-2">
          <LocaleSwitcher />
        </div>

        <div class="order-3 ml-auto flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-semibold sm:order-2 sm:w-auto sm:flex-nowrap sm:pb-0">
          <Link
            to="/"
            class="nav-link"
            activeProps={{ class: 'nav-link is-active' }}
          >
            {content.navHome}
          </Link>
          <Link
            to="/about"
            class="nav-link"
            activeProps={{ class: 'nav-link is-active' }}
          >
            {content.navAbout}
          </Link>
          <a
            href="https://tanstack.com/start/latest/docs/framework/solid/overview"
            target="_blank"
            rel="noreferrer"
            class="nav-link"
          >
            {content.navDocs}
          </a>
        </div>
      </nav>
    </header>
  )
}
