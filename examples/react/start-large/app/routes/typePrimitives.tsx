import { redirect, useParams, useSearch } from '@tanstack/react-router'
import type {
  ValidateFrom,
  ValidateId,
  ValidateNavigateOptions,
  ValidateNavigateOptionsArray,
  ValidateParams,
  ValidateSearch,
  ValidateTo,
  ValidateUseParamsOptions,
  ValidateUseParamsResult,
  ValidateUseSearchOptions,
  ValidateUseSearchResult,
} from '@tanstack/react-router'

export const customTo = <TTo extends string>(to: ValidateTo<TTo>) => {
  throw redirect({ to })
}

export const customFrom = <TFrom extends string>(from: ValidateFrom<TFrom>) => {
  throw redirect({ from })
}

export const customFromAndTo = <TTo extends string, TFrom extends string>(
  from: ValidateFrom<TFrom>,
  to: ValidateTo<TTo, TFrom>,
) => {
  throw redirect({ from, to })
}

export const customSearch = <TTo extends string>(
  options: {
    to: ValidateTo<TTo>
  } & ValidateSearch<TTo>,
) => {
  throw redirect(options as never)
}

export const customParams = <TTo extends string>(
  options: { to: ValidateTo<TTo> } & ValidateParams<TTo>,
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
  return useSearch(options as never)
}

export const useCustomParams = <TOptions,>(
  options: ValidateUseParamsOptions<TOptions>,
): ValidateUseParamsResult<TOptions> => {
  return useParams(options as never)
}
