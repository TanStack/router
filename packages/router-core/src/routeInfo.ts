export type ParseRoute<TRouteTree, TAcc = TRouteTree> = TRouteTree extends {
  types: { children: infer TChildren }
}
  ? unknown extends TChildren
    ? TAcc
    : TChildren extends ReadonlyArray<any>
      ? ParseRoute<TChildren[number], TAcc | TChildren[number]>
      : ParseRoute<
          TChildren[keyof TChildren],
          TAcc | TChildren[keyof TChildren]
        >
  : TAcc

export type ParentPath<TOption> = 'always' extends TOption
  ? '../'
  : 'never' extends TOption
    ? '..'
    : '../' | '..'

export type CurrentPath<TOption> = 'always' extends TOption
  ? './'
  : 'never' extends TOption
    ? '.'
    : './' | '.'
