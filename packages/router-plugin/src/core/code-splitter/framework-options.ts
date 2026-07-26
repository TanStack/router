import type { Config } from '../config'

type FrameworkOptions = {
  package: string
  idents: {
    createFileRoute: string
    lazyFn: string
    lazyRouteComponent: string
  }
}

const frameworkOptions = {
  react: {
    package: '@tanstack/react-router',
    idents: {
      createFileRoute: 'createFileRoute',
      lazyFn: 'lazyFn',
      lazyRouteComponent: 'lazyRouteComponent',
    },
  },
  solid: {
    package: '@tanstack/solid-router',
    idents: {
      createFileRoute: 'createFileRoute',
      lazyFn: 'lazyFn',
      lazyRouteComponent: 'lazyRouteComponent',
    },
  },
  vue: {
    package: '@tanstack/vue-router',
    idents: {
      createFileRoute: 'createFileRoute',
      lazyFn: 'lazyFn',
      lazyRouteComponent: 'lazyRouteComponent',
    },
  },
  octane: {
    package: '@tanstack/octane-router',
    idents: {
      createFileRoute: 'createFileRoute',
      lazyFn: 'lazyFn',
      lazyRouteComponent: 'lazyRouteComponent',
    },
  },
} satisfies Record<Config['target'], FrameworkOptions>

export function getFrameworkOptions(
  framework: Config['target'],
): FrameworkOptions {
  return frameworkOptions[framework]
}
