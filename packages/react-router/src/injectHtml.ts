// export function useInjectHtml() {
//   const { } = useRouter()
//   return React.useCallback(
//     (html: string | (() => Promise<string> | string)) => {
//       router.injectHtml(html)
//     },
//     [],
//   )
// }
// export function useDehydrate() {
//   const { } = useRouter()
//   return React.useCallback(function dehydrate<T>(
//     key: any,
//     data: T | (() => Promise<T> | T),
//   ) {
//     return router.dehydrateData(key, data)
//   },
//   [])
// }
// export function useHydrate() {
//   const { } = useRouter()
//   return function hydrate<T = unknown>(key: any) {
//     return router.hydrateData(key) as T
//   }
// }
// This is the messiest thing ever... I'm either seriously tired (likely) or
// there has to be a better way to reset error boundaries when the
// router's location key changes.
