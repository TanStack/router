import type {
  Constrain,
  OptionalStructuralSharing,
  Register,
  RegisteredRouter,
  ValidateJSON,
} from '@tanstack/router-core'

export type DefaultStructuralSharingEnabled<
  TRegister extends Register = Register,
> =
  boolean extends RegisteredRouter<TRegister>['options']['defaultStructuralSharing']
    ? // for now, default to false.
      // TODO in V2: default to true
      false
    : NonNullable<
        RegisteredRouter<TRegister>['options']['defaultStructuralSharing']
      >

export interface RequiredStructuralSharing<TStructuralSharing, TConstraint> {
  readonly structuralSharing: Constrain<TStructuralSharing, TConstraint>
}

export type StructuralSharingOption<
  TRegister extends Register,
  TSelected,
  TStructuralSharing,
> = unknown extends TSelected
  ? OptionalStructuralSharing<TStructuralSharing, boolean>
  : unknown extends RegisteredRouter<TRegister>['routeTree']
    ? OptionalStructuralSharing<TStructuralSharing, boolean>
    : TSelected extends ValidateJSON<TSelected>
      ? OptionalStructuralSharing<TStructuralSharing, boolean>
      : DefaultStructuralSharingEnabled<TRegister> extends true
        ? RequiredStructuralSharing<TStructuralSharing, false>
        : OptionalStructuralSharing<TStructuralSharing, false>

export type StructuralSharingEnabled<
  TRegister extends Register,
  TStructuralSharing,
> = boolean extends TStructuralSharing
  ? DefaultStructuralSharingEnabled<TRegister>
  : TStructuralSharing

export type ValidateSelected<
  TRegister extends Register,
  TSelected,
  TStructuralSharing,
> =
  StructuralSharingEnabled<TRegister, TStructuralSharing> extends true
    ? ValidateJSON<TSelected>
    : TSelected
