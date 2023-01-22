export interface FrameworkGenerics {
  // The following properties are used internally
  // and are extended by framework adapters, but cannot be
  // pre-defined as constraints:
  //
  // Component: any
  // ErrorComponent: any
}

export type GetFrameworkGeneric<U> = U extends keyof FrameworkGenerics
  ? FrameworkGenerics[U]
  : any
