import { redirect, useParams, useSearch } from '@tanstack/react-router'
import type {
  ValidateFromPath,
  ValidateId,
  ValidateNavigateOptions,
  ValidateNavigateOptionsArray,
  ValidateParams,
  ValidateSearch,
  ValidateToPath,
  ValidateUseParamsOptions,
  ValidateUseParamsResult,
  ValidateUseSearchOptions,
  ValidateUseSearchResult,
} from '@tanstack/react-router'

export const customTo = <TTo extends string>(to: ValidateToPath<TTo>) => {
  throw redirect({ to })
}

export const customFrom = <TFrom extends string>(
  from: ValidateFromPath<TFrom>,
) => {
  throw redirect({ from })
}

export const customFromAndTo = <TTo extends string, TFrom extends string>(
  from: ValidateFromPath<TFrom>,
  to: ValidateToPath<TTo, TFrom>,
) => {
  throw redirect({ from, to })
}

export const customSearch = <TTo extends string>(
  options: {
    to: ValidateToPath<TTo>
  } & ValidateSearch<TTo>,
) => {
  throw redirect(options as never)
}

export const customParams = <TTo extends string>(
  options: { to: ValidateToPath<TTo> } & ValidateParams<TTo>,
) => {
  throw redirect(options as never)
}

export const customNavigateOptions = <TOptions,>(
  options: ValidateNavigateOptions<TOptions>,
) => {
  throw redirect(options)
}

export const customNavigateOptionsArray = <
  TOptions extends ReadonlyArray<unknown>,
>(
  ...options: ValidateNavigateOptionsArray<TOptions>
) => {
  for (const option of options) {
    throw redirect(option)
  }
}

export const useCustomId = <TId extends string>(id: ValidateId<TId>) => {
  console.log(id)
}

export const useCustomSearch = <TOptions,>(
  options: ValidateUseSearchOptions<TOptions>,
): ValidateUseSearchResult<TOptions> => {
  return useSearch(options as never) as any
}

export const useCustomParams = <TOptions,>(
  options: ValidateUseParamsOptions<TOptions>,
): ValidateUseParamsResult<TOptions> => {
  return useParams(options as never)
}
