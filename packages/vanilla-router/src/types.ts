// Vanilla component types
// Components receive router as parameter and return a render function with no parameters
export type VanillaComponent = (router: import('@tanstack/router-core').AnyRouter) => (() => string) | [() => void, () => string]

export type VanillaRouteComponent = VanillaComponent
export type VanillaErrorRouteComponent = (props: { error: Error }) => VanillaComponent
export type VanillaNotFoundRouteComponent = (props: { data?: any }) => VanillaComponent

