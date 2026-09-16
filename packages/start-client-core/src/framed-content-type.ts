/** Shared with the dispatcher without importing the framed decoder protocol. */
export const TSS_CONTENT_TYPE_FRAMED = 'application/x-tss-framed'

/** Current protocol version for framed responses. */
export const TSS_FRAMED_PROTOCOL_VERSION = 1

/** Header construction stays outside the optional decoder protocol module. */
export const TSS_CONTENT_TYPE_FRAMED_VERSIONED = `${TSS_CONTENT_TYPE_FRAMED}; v=${TSS_FRAMED_PROTOCOL_VERSION}`
