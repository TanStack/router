type FrameworkOptions = {
  package: string
  idents: {
    createFileRoute: string
    lazyFn: string
    lazyRouteComponent: string
    dummyHMRComponent: string
  }
  dummyHMRComponent: string
}

export function getFrameworkOptions(framework: string): FrameworkOptions {
  let frameworkOptions: FrameworkOptions

  switch (framework) {
    case 'react':
      frameworkOptions = {
        package: '@tanstack/react-router',
        idents: {
          createFileRoute: 'createFileRoute',
          lazyFn: 'lazyFn',
          lazyRouteComponent: 'lazyRouteComponent',
          dummyHMRComponent: 'TSRDummyComponent',
        },
        dummyHMRComponent: `export function TSRDummyComponent() { return null }`,
      }
      break
    case 'solid':
      frameworkOptions = {
        package: '@tanstack/solid-router',
        idents: {
          createFileRoute: 'createFileRoute',
          lazyFn: 'lazyFn',
          lazyRouteComponent: 'lazyRouteComponent',
          dummyHMRComponent: 'TSRDummyComponent',
        },
        dummyHMRComponent: `export function TSRDummyComponent() { return null }`,
      }
      break
    default:
      throw new Error(
        `[getFrameworkOptions] - Unsupported framework: ${framework}`,
      )
  }

  return frameworkOptions
}
