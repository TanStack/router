import { createMemo } from 'solid-js'
import { useMatch } from './useMatch'
import { useRouter } from './useRouter'
import type { Accessor } from 'solid-js'
import type {
  AnyRouter,
  RegisteredRouter,
  ResolveUseParams,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseParamsResult,
} from '@tanstack/router-core'

export interface UseParamsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (params: ResolveUseParams<TRouter, TFrom, TStrict>) => TSelected
  shouldThrow?: TThrow
}

export type UseParamsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseParamsBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type UseParamsRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: UseParamsBaseOptions<
    TRouter,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected
  >,
) => Accessor<UseParamsResult<TRouter, TFrom, true, TSelected>>

export function useParams<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseParamsOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Accessor<
  ThrowOrOptional<UseParamsResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  const router = useRouter()

  const isStrict = opts.strict !== false

  const matchResult = useMatch({
    from: opts.from!,
    shouldThrow: opts.shouldThrow,
    strict: opts.strict,
    select: (match) => (isStrict ? match.id : match),
  }) as Accessor<any>

  const params = createMemo(() => {
    const res = matchResult()

    return isStrict ? router.getMatch(res)?.params : res.params
  })

  return createMemo(() => {
    const p = params()

    return opts.select ? (opts.select(p) as any) : (p ?? {})
  })
}
