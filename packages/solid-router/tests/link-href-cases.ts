// kind, final href, blocked, active
export const linkHrefCases: Array<
  readonly [
    kind: 'history' | 'rewrite' | 'to',
    href: string,
    blocked: boolean,
    active: boolean,
  ]
> = [
  ['history', '/formatted', false, true],
  ['rewrite', '/safe', false, true],
]
