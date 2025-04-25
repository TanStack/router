export { setGlobalOrigin } from 'undici'

/**
 * Constructs an absolute URL from the given request object and options.
 *
 * @param req - The `Request` object containing the headers to extract the host and protocol.
 * @param options - Configuration options for determining the trust level of proxy headers.
 * @param options.trustProxy - If `true`, the function will trust the `x-forwarded-host` and `x-forwarded-proto` headers
 *                             to determine the host and protocol. Defaults to `false`.
 * @returns The absolute URL constructed from the request headers as a string.
 * @throws Will throw an error if the `host` cannot be determined from the request headers.
 *
 * @example
 * ```ts
 * // Example usage:
 * const req = new Request('http://example.com', {
 *   headers: {
 *     'host': 'example.com',
 *     'x-forwarded-host': 'proxy.example.com',
 *     'x-forwarded-proto': 'https',
 *   },
 * });
 *
 * // Without trusting proxy headers
 * const url1 = getAbsoluteUrl(req);
 * console.log(url1); // Output: "http://example.com"
 *
 * // With trusting proxy headers
 * const url2 = getAbsoluteUrl(req, { trustProxy: true });
 * console.log(url2); // Output: "https://proxy.example.com"
 * ```
 */
export function getAbsoluteUrl(
  req: Request,
  options: { trustProxy: boolean } = { trustProxy: false },
): string {
  const headers = req.headers

  const host = options.trustProxy
    ? headers.get('x-forwarded-host') || headers.get('host')
    : headers.get('host')

  const protocol = options.trustProxy
    ? headers.get('x-forwarded-proto') || 'http'
    : 'http'

  if (!host) throw new Error('Cannot determine host from request headers')

  return `${protocol}://${host}`
}
