export type { StartModuleRequirements } from '@tanstack/react-start'

declare module '@tanstack/react-start' {
  interface StartModuleRequirements {
    '@start-route-modules/catalog': { requestContext: { shopper: string } }
  }
}
