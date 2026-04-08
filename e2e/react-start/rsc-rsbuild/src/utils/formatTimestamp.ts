export function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString()
}
