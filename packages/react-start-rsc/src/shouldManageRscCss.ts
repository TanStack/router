// Defined by the Vite RSC integration; other bundlers still need CSS management.
declare const TSS_VITE_RSC_DEV: boolean | undefined

export function shouldManageRscCss(): boolean {
  // Vite replaces its development stylesheet links during HMR. Giving React
  // precedence ownership would retain links for the old timestamped URLs.
  return (
    process.env.NODE_ENV === 'production' ||
    typeof TSS_VITE_RSC_DEV === 'undefined' ||
    !TSS_VITE_RSC_DEV
  )
}
