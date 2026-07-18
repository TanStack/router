export function validateOctaneCompilerOptions(
  octaneOptions: object | undefined,
): void {
  if (octaneOptions && 'ssr' in octaneOptions) {
    throw new Error(
      '`octane.ssr` is not supported by TanStack Start. Start compiles its client and server environments separately and selects the correct Octane compilation mode for each one.',
    )
  }
}
