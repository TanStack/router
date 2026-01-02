import { Signal } from '@angular/core'
import {
  AnyRouter,
  RegisteredRouter,
  ResolveUseLoaderData,
  StrictOrFrom,
  UseLoaderDataResult,
} from '@tanstack/router-core'
import { injectMatch } from './injectMatch'

export interface InjectLoaderDataBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> {
  select?: (match: ResolveUseLoaderData<TRouter, TFrom, TStrict>) => TSelected
}

export type InjectLoaderDataOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  InjectLoaderDataBaseOptions<TRouter, TFrom, TStrict, TSelected>

export type InjectLoaderDataRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: InjectLoaderDataBaseOptions<TRouter, TFrom, true, TSelected>,
) => Signal<UseLoaderDataResult<TRouter, TFrom, true, TSelected>>

export function injectLoaderData<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: InjectLoaderDataOptions<TRouter, TFrom, TStrict, TSelected>,
): Signal<UseLoaderDataResult<TRouter, TFrom, TStrict, TSelected>> {
  return injectMatch({
    from: opts.from!,
    strict: opts.strict as true | undefined,
    select: (s: any) =>
      opts.select ? opts.select(s.loaderData) : s.loaderData,
  } as any) as any
}
