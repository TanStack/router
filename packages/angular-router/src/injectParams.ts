import * as Angular from '@angular/core'
import type {
  AnyRouter,
  RegisteredRouter,
  ResolveUseParams,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
  UseParamsResult,
} from '@tanstack/router-core'
import { injectMatch } from './injectMatch'

export interface InjectParamsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (params: ResolveUseParams<TRouter, TFrom, TStrict>) => TSelected
  shouldThrow?: TThrow
}

export type InjectParamsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  InjectParamsBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type InjectParamsRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: InjectParamsBaseOptions<
    TRouter,
    TFrom,
    /* TStrict */ true,
    /* TThrow */ true,
    TSelected
  >,
) => Angular.Signal<UseParamsResult<TRouter, TFrom, true, TSelected>>

export function injectParams<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: InjectParamsOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Angular.Signal<
  ThrowOrOptional<UseParamsResult<TRouter, TFrom, true, TSelected>, TThrow>
> {
  return injectMatch({
    from: opts.from!,
    strict: opts.strict as true | undefined,
    shouldThrow: opts.shouldThrow,
    select: (match: any) => {
      const params = opts.strict === false ? match.params : match._strictParams

      return opts.select ? opts.select(params) : params
    },
  } as any) as Angular.Signal<any>
}
