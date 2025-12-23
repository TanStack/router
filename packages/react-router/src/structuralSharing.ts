import type {
  AnyRouter,
  Constrain,
  OptionalStructuralSharing,
  Register,
  RegisteredRouter,
  ValidateJSON,
} from '@tanstack/router-core'

export type DefaultStructuralSharingEnabled<
  TRouterOrRegister extends AnyRouter | Register,
> = (
  TRouterOrRegister extends Register
    ? RegisteredRouter<TRouterOrRegister>
    : TRouterOrRegister
) extends infer TRouter extends AnyRouter
  ? boolean extends TRouter['options']['defaultStructuralSharing']
    ? // for now, default to false.
      // TODO in V2: default to true
      false
    : NonNullable<TRouter['options']['defaultStructuralSharing']>
  : never

export interface RequiredStructuralSharing<TStructuralSharing, TConstraint> {
  readonly structuralSharing: Constrain<TStructuralSharing, TConstraint>
}

export type StructuralSharingOption<
  TRouterOrRegister extends AnyRouter | Register,
  TSelected,
  TStructuralSharing,
> = unknown extends TSelected
  ? OptionalStructuralSharing<TStructuralSharing, boolean>
  : (
        TRouterOrRegister extends Register
          ? RegisteredRouter<TRouterOrRegister>['routeTree']
          : TRouterOrRegister extends AnyRouter
            ? TRouterOrRegister['routeTree']
            : never
      ) extends unknown
    ? OptionalStructuralSharing<TStructuralSharing, boolean>
    : TSelected extends ValidateJSON<TSelected>
      ? OptionalStructuralSharing<TStructuralSharing, boolean>
      : DefaultStructuralSharingEnabled<TRouterOrRegister> extends true
        ? RequiredStructuralSharing<TStructuralSharing, false>
        : OptionalStructuralSharing<TStructuralSharing, false>

export type StructuralSharingEnabled<
  TRouterOrRegister extends AnyRouter | Register,
  TStructuralSharing,
> = boolean extends TStructuralSharing
  ? DefaultStructuralSharingEnabled<TRouterOrRegister>
  : TStructuralSharing

export type ValidateSelected<
  TRouterOrRegister extends AnyRouter | Register,
  TSelected,
  TStructuralSharing,
> =
  StructuralSharingEnabled<TRouterOrRegister, TStructuralSharing> extends true
    ? ValidateJSON<TSelected>
    : TSelected
