/**
 * The apps of the route error recovery tests (start-dev-route-error-recovery
 * and start-dev-route-loader-error): Start on Vite dev with each framework's
 * own plugin, a root route that renders the document (`shellComponent`), and
 * the index route.
 */
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import react from '@vitejs/plugin-react'
import solid from 'vite-plugin-solid'
import type { StartDevServerOptions } from '../dev-server'

export type Framework = 'react' | 'solid' | 'vue'

/** The index route; `throwInBrowser`: its component throws when it renders in the browser (SSR renders it). */
export const index = (
  framework: Framework,
  text: string,
  throwInBrowser: boolean,
  errorComponent = false,
) => {
  const options = errorComponent
    ? `{ component: Home, errorComponent: () => <p data-probe="error">route-error</p> }`
    : `{ component: Home }`
  const body = `${throwInBrowser ? `if (typeof window !== 'undefined') throw new Error('home-throws-in-browser')\n  ` : ''}return <p data-probe="home">${text}</p>`
  return framework === 'vue'
    ? `import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'
const Home = defineComponent({
  setup: () => () => {
    ${body}
  },
})
export const Route = createFileRoute('/')(${options})
`
    : `import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/')(${options})
function Home() {
  ${body}
}
`
}

export const apps: Record<
  Framework,
  Pick<StartDevServerOptions, 'framework' | 'plugins' | 'files'>
> = {
  react: {
    framework: 'react',
    plugins: [react()],
    files: {
      'harness/client-entry.ts': `import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start/client'
hydrateRoot(document, createElement(StartClient))
`,
      'harness/server-entry.ts': `export { default } from '@tanstack/react-start/server-entry'\n`,
      'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
      'src/routes/__root.tsx': `import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
export const Route = createRootRoute({ shellComponent: Shell })
function Shell({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
`,
    },
  },
  solid: {
    framework: 'solid',
    plugins: [solid({ ssr: true })],
    files: {
      'harness/client-entry.ts': `import { createComponent, hydrate } from 'solid-js/web'
import { StartClient, hydrateStart } from '@tanstack/solid-start/client'
hydrateStart().then((router) => {
  hydrate(() => createComponent(StartClient, { router }), document)
})
`,
      'harness/server-entry.ts': `export { default } from '@tanstack/solid-start/server-entry'\n`,
      'src/router.ts': `import { createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
      'src/routes/__root.tsx': `import { HeadContent, Scripts, createRootRoute } from '@tanstack/solid-router'
import { HydrationScript } from 'solid-js/web'
import type { JSX } from 'solid-js'
export const Route = createRootRoute({ shellComponent: Shell })
function Shell(props: { children: JSX.Element }) {
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        {props.children}
        <Scripts />
      </body>
    </html>
  )
}
`,
    },
  },
  vue: {
    framework: 'vue',
    plugins: [vue(), vueJsx()],
    files: {
      'harness/client-entry.ts': `import { createSSRApp } from 'vue'
import { StartClient, hydrateStart } from '@tanstack/vue-start/client'
hydrateStart().then((router) => {
  createSSRApp(StartClient, { router }).mount('#__app')
})
`,
      'harness/server-entry.ts': `export { default } from '@tanstack/vue-start/server-entry'\n`,
      'src/router.ts': `import { createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
      'src/routes/__root.tsx': `import { defineComponent } from 'vue'
import { Body, HeadContent, Html, Scripts, createRootRoute } from '@tanstack/vue-router'
const Shell = defineComponent({
  setup(_, { slots }) {
    return () => (
      <Html>
        <head>
          <HeadContent />
        </head>
        <Body>
          {slots.default?.()}
          <Scripts />
        </Body>
      </Html>
    )
  },
})
export const Route = createRootRoute({ shellComponent: Shell })
`,
    },
  },
}
