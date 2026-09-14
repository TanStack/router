export function createServerFnTransportAliases(
  transport: 'bundled' | 'lazy' = 'bundled',
): Partial<Record<'#tanstack-start-server-fn-codec', string>> {
  return transport === 'lazy'
    ? {
        '#tanstack-start-server-fn-codec':
          '@tanstack/start-client-core/client-rpc/codec-stub',
      }
    : {}
}
