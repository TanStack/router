/** Absent or undefined factory options cannot prove their entries always run. */
export type StartOptionList<
  TOptions,
  TKey extends PropertyKey,
  TList extends ReadonlyArray<unknown>,
> =
  TOptions extends Record<TKey, unknown>
    ? undefined extends TOptions[TKey]
      ? [] | TList
      : TList
    : [] | TList
