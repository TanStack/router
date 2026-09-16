import { TSS_FRAMED_PROTOCOL_VERSION } from './framed-content-type'

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
