export const TSS_FORMDATA_CONTEXT = '__TSS_CONTEXT'
export const TSS_SERVER_FUNCTION = Symbol.for('TSS_SERVER_FUNCTION')
export const TSS_SERVER_FUNCTION_FACTORY = Symbol.for(
  'TSS_SERVER_FUNCTION_FACTORY',
)

export const X_TSS_SERIALIZED = 'x-tss-serialized'
export const X_TSS_RAW_RESPONSE = 'x-tss-raw'
export const X_TSS_CONTEXT = 'x-tss-context'

/** Content-Type for multiplexed framed responses (RawStream support) */
export const TSS_CONTENT_TYPE_FRAMED = 'application/x-tss-framed'

/**
 * Frame types for binary multiplexing protocol.
 */
export const FrameType = {
  /** Seroval JSON chunk (NDJSON line) */
  JSON: 0,
  /** Raw stream data chunk */
  CHUNK: 1,
  /** Raw stream end (EOF) */
  END: 2,
  /** Raw stream error */
  ERROR: 3,
} as const

export type FrameType = (typeof FrameType)[keyof typeof FrameType]

/** Header size in bytes: type(1) + streamId(4) + length(4) */
export const FRAME_HEADER_SIZE = 9

/** Current protocol version for framed responses */
export const TSS_FRAMED_PROTOCOL_VERSION = 1

/** Full Content-Type header value with version parameter */
export const TSS_CONTENT_TYPE_FRAMED_VERSIONED = `${TSS_CONTENT_TYPE_FRAMED}; v=${TSS_FRAMED_PROTOCOL_VERSION}`

/**
 * Parses the version parameter from a framed Content-Type header.
 * Returns undefined if no version parameter is present.
 */
const FRAMED_VERSION_REGEX = /;\s*v=(\d+)/
export function parseFramedProtocolVersion(
  contentType: string,
): number | undefined {
  // Match "v=<number>" in the content-type parameters
  const match = contentType.match(FRAMED_VERSION_REGEX)
  return match ? parseInt(match[1]!, 10) : undefined
}

/**
 * Validates that the server's protocol version is compatible with this client.
 * Throws an error if versions are incompatible.
 */
export function validateFramedProtocolVersion(contentType: string): void {
  const serverVersion = parseFramedProtocolVersion(contentType)
  if (serverVersion === undefined) {
    // No version specified - assume compatible (backwards compat)
    return
  }
  if (serverVersion !== TSS_FRAMED_PROTOCOL_VERSION) {
    throw new Error(
      `Incompatible framed protocol version: server=${serverVersion}, client=${TSS_FRAMED_PROTOCOL_VERSION}. ` +
        `Please ensure client and server are using compatible versions.`,
    )
  }
}
export {}
