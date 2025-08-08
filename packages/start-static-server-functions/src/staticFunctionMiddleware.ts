import { createMiddleware, startSerializer } from '@tanstack/start-client-core'

type StaticCachedResult = {
  result: any
  context: any
}

type ServerFnStaticCache = {
  getItem: (opts: {
    functionId: string
    data: any
  }) => StaticCachedResult | Promise<StaticCachedResult | undefined>
  setItem: (opts: {
    functionId: string
    data: any
    response: StaticCachedResult
  }) => Promise<void>
}

/**
 * This is a simple hash function for generating a hash from a string to make the filenames shorter.
 *
 * It is not cryptographically secure (as its using SHA-1) and should not be used for any security purposes.
 *
 * It is only used to generate a hash for the static cache filenames.
 *
 * @param message - The input string to hash.
 * @returns A promise that resolves to the SHA-1 hash of the input string in hexadecimal format.
 *
 * @example
 * ```typescript
 * const hash = await sha1Hash("hello");
 * console.log(hash); // Outputs the SHA-1 hash of "hello" -> "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d"
 * ```
 */
async function sha1Hash(message: string): Promise<string> {
  // Encode the string as UTF-8
  const msgBuffer = new TextEncoder().encode(message)

  // Hash the message
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer)

  // Convert the ArrayBuffer to a string
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

const getStaticCacheUrl = async (opts: {
  functionId: string
  hash: string
}) => {
  const filename = await sha1Hash(`${opts.functionId}__${opts.hash}`)
  return `/__tsr/staticServerFnCache/${filename}.json`
}

const jsonToFilenameSafeString = (json: any) => {
  // Custom replacer to sort keys
  const sortedKeysReplacer = (key: string, value: any) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.keys(value)
          .sort()
          .reduce((acc: any, curr: string) => {
            acc[curr] = value[curr]
            return acc
          }, {})
      : value

  // Convert JSON to string with sorted keys
  const jsonString = JSON.stringify(json ?? '', sortedKeysReplacer)

  // Replace characters invalid in filenames
  return jsonString
    .replace(/[/\\?%*:|"<>]/g, '-') // Replace invalid characters with a dash
    .replace(/\s+/g, '_') // Optionally replace whitespace with underscores
}

const staticClientCache =
  typeof document !== 'undefined' ? new Map<string, any>() : null

const serverFnStaticCache: ServerFnStaticCache = {
  getItem: async (ctx) => {
    if (typeof document === 'undefined') {
      const hash = jsonToFilenameSafeString(ctx.data)
      const url = await getStaticCacheUrl({ functionId: ctx.functionId, hash })
      const publicUrl = process.env.TSS_OUTPUT_PUBLIC_DIR!

      // Use fs instead of fetch to read from filesystem
      const { promises: fs } = await import('node:fs')
      const path = await import('node:path')
      const filePath = path.join(publicUrl, url)

      const [cachedResult, readError] = await fs
        .readFile(filePath, 'utf-8')
        .then((c) => [startSerializer.parse(c), null])
        .catch((e) => [null, e])

      if (readError && readError.code !== 'ENOENT') {
        throw readError
      }

      return cachedResult as StaticCachedResult
    }

    return undefined
  },
  setItem: async ({ data, functionId, response }) => {
    const { promises: fs } = await import('node:fs')
    const path = await import('node:path')

    const hash = jsonToFilenameSafeString(data)
    const url = await getStaticCacheUrl({ functionId, hash })
    const publicUrl = process.env.TSS_OUTPUT_PUBLIC_DIR!
    const filePath = path.join(publicUrl, url)

    // Ensure the directory exists
    await fs.mkdir(path.dirname(filePath), { recursive: true })

    // Store the result with fs
    await fs.writeFile(
      filePath,
      startSerializer.stringify({
        result: response.result,
        context: response.context.sendContext,
      }),
      'utf-8',
    )
  },
}

const fetchItem = async ({
  data,
  functionId,
}: {
  data: any
  functionId: string
}) => {
  const hash = jsonToFilenameSafeString(data)
  const url = await getStaticCacheUrl({ functionId, hash })

  let result: any = staticClientCache?.get(url)

  result = await fetch(url, {
    method: 'GET',
  })
    .then((r) => r.text())
    .then((d) => startSerializer.parse(d))

  return result
}

export const staticFunctionMiddleware = createMiddleware({ type: 'function' })
  .client(async (ctx) => {
    if (
      process.env.NODE_ENV === 'production' &&
      // do not run this during SSR on the server
      typeof document !== 'undefined'
    ) {
      const response = await fetchItem({
        functionId: ctx.functionId,
        data: ctx.data,
      })

      if (response) {
        return {
          result: response.result,
          context: { ...(ctx as any).context, ...response.context },
        } as any
      }
    }
    return ctx.next()
  })
  .server(async (ctx) => {
    const response = await ctx.next()

    if (process.env.NODE_ENV === 'production') {
      await serverFnStaticCache.setItem({
        functionId: ctx.functionId,
        response: { result: (response as any).result, context: ctx },
        data: ctx.data,
      })
    }

    return response
  })
