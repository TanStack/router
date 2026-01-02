import { Signal } from '@angular/core'
import {
  AnyRouter,
  RegisteredRouter,
  ResolveUseLoaderDeps,
  StrictOrFrom,
  UseLoaderDepsResult,
} from '@tanstack/router-core'
import { injectMatch } from './injectMatch'

export interface InjectLoaderDepsBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TSelected,
> {
  select?: (deps: ResolveUseLoaderDeps<TRouter, TFrom>) => TSelected
}

export type InjectLoaderDepsOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TSelected,
> = StrictOrFrom<TRouter, TFrom> &
  InjectLoaderDepsBaseOptions<TRouter, TFrom, TSelected>

export type InjectLoaderDepsRoute<out TFrom> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
>(
  opts?: InjectLoaderDepsBaseOptions<TRouter, TFrom, TSelected>,
) => Signal<UseLoaderDepsResult<TRouter, TFrom, TSelected>>

export function injectLoaderDeps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
>(
  opts: InjectLoaderDepsOptions<TRouter, TFrom, TSelected>,
): Signal<UseLoaderDepsResult<TRouter, TFrom, TSelected>> {
  const { select, ...rest } = opts
  return injectMatch({
    ...rest,
    select: (s) => (select ? select(s.loaderDeps) : s.loaderDeps),
  }) as any
}
