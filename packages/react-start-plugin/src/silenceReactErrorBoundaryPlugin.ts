import { resolveViteId } from '@tanstack/start-plugin-core'
import type { Plugin } from 'vite'

const reactDomClientId = 'react-dom/client'
const resolvedId = resolveViteId('react-dom/client-tss')

export function silenceReactErrorBoundaryPlugin(): Plugin {
  return {
    name: 'tanstack:silence-react-error-boundary-plugin',
    enforce: 'pre',
    resolveId: {
      filter: {
        id: new RegExp(`^${reactDomClientId}$`),
      },
      handler(id, importer) {
        if (importer && importer !== resolvedId) {
          return resolvedId
        }
        return null
      },
    },
    load: {
      filter: {
        id: new RegExp(`^${resolvedId}$`),
      },
      handler(id) {
        if (id !== resolvedId) {
          return null
        }
        return `
                  import * as ReactDOMClient from 'react-dom/client';
                  import { isRecoverableError } from '@tanstack/react-router'
                  const originalHydrateRoot = ReactDOMClient.hydrateRoot;
                  ReactDOMClient.hydrateRoot = (container, initialChildren, options = {}) =>
                    originalHydrateRoot(container, initialChildren, {
                      ...options,
                      onRecoverableError(error) {
                        if (isRecoverableError(error)) return;
                        options?.onRecoverableError
                          ? options.onRecoverableError(error)
                          : console.error(error);
                      },
                  });
                  export const hydrateRoot = ReactDOMClient.hydrateRoot;
                  export { ReactDOMClient as default };
                  `
      },
    },
  }
}
