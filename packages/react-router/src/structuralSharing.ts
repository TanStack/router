import type { Constrain, ValidateJSON } from './utils'
import type { AnyRouter } from './router'

export type DefaultStructuralSharingEnabled<TRouter extends AnyRouter> =
  boolean extends TRouter['options']['defaultStructuralSharing']
    ? // for now, default to false.
      // TODO in V2: default to true
      false
    : NonNullable<TRouter['options']['defaultStructuralSharing']>

export interface OptionalStructuralSharing<TStructuralSharing, TConstraint> {
  readonly structuralSharing?:
    | Constrain<TStructuralSharing, TConstraint>
    | undefined
}

export interface RequiredStructuralSharing<TStructuralSharing, TConstraint> {
  readonly structuralSharing: Constrain<TStructuralSharing, TConstraint>
}

export type StructuralSharingOption<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing,
> = AnyRouter extends TRouter
  ? OptionalStructuralSharing<TStructuralSharing, boolean>
  : TSelected extends ValidateJSON<TSelected>
    ? OptionalStructuralSharing<TStructuralSharing, boolean>
    : DefaultStructuralSharingEnabled<TRouter> extends true
      ? RequiredStructuralSharing<TStructuralSharing, false>
      : OptionalStructuralSharing<TStructuralSharing, false>

export type StructuralSharingEnabled<
  TRouter extends AnyRouter,
  TStructuralSharing,
> = boolean extends TStructuralSharing
  ? DefaultStructuralSharingEnabled<TRouter>
  : TStructuralSharing

export type ValidateSelected<
  TRouter extends AnyRouter,
  TSelected,
  TStructuralSharing,
> =
  true extends StructuralSharingEnabled<TRouter, TStructuralSharing>
    ? Constrain<TSelected, ValidateJSON<TSelected>>
    : TSelected
