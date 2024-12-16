import { redirect } from '@tanstack/react-router'
import type {
  ValidateFrom,
  ValidateId,
  ValidateNavigateOptions,
  ValidateParams,
  ValidateSearch,
  ValidateTo,
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
  throw redirect(options as any)
}

export const customParams = <TTo extends string>(
  options: { to: ValidateTo<TTo> } & ValidateParams<TTo>,
) => {
  throw redirect(options as any)
}

export const customNavigateOptions = <TTo extends string, TFrom extends string>(
  options: ValidateNavigateOptions<TTo, TFrom>,
) => {
  throw redirect(options)
}

export const useCustomId = <TId extends string>(id: ValidateId<TId>) => {
  console.log(id)
}
