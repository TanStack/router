import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";
const _H0 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenNever.tsx?tss-hydrate=0_b752509d76"), "H0");
import { Hydrate } from '@tanstack/react-start';
import { never } from '@tanstack/react-start/hydration';
export function Page() {
  return (<Hydrate when={never()} h="0_b752509d76">{<_H0 />}</Hydrate>);
}