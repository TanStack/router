export function getStartContext() {
  return {
    startOptions: undefined,
  }
}

export async function runWithStartContext<T>(
  _context: unknown,
  fn: () => T | Promise<T>,
) {
  return fn()
}
