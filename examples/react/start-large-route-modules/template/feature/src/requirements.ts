export type { StartModuleRequirements } from '@tanstack/react-start'

// The application says who is viewing; the module does not authenticate.
declare module '@tanstack/react-start' {
  interface StartModuleRequirements {
    ['__MODULE_ID__']: {
      requestContext: { viewer: string }
    }
  }
}
