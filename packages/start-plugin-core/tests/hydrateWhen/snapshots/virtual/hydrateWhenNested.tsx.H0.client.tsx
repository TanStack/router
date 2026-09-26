import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";
const _H1 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenNested.tsx?tss-hydrate=1_466696e41d"), "H1");
import { Hydrate } from '@tanstack/react-start';
import { interaction } from '@tanstack/react-start/hydration';
function Outer() {
  return <section>Outer</section>;
}
export function H0() {
  return <>
        <Outer />
        <Hydrate when={interaction()} h="1_466696e41d">{<_H1 />}</Hydrate>
      </>;
}