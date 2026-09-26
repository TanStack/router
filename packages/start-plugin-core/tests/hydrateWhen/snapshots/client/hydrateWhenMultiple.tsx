import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";
const _H0 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=0_21aa371e0f"), "H0");
const _H1 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=1_21aa371e0f"), "H1");
const _H2 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=2_21aa371e0f"), "H2");
import { Hydrate } from '@tanstack/react-start';
import { load, media, visible } from '@tanstack/react-start/hydration';
export function Page() {
  return (<>
      <Hydrate when={load()} h="0_21aa371e0f">{<_H0 />}</Hydrate>
      <Hydrate when={visible()} h="1_21aa371e0f">{<_H1 />}</Hydrate>
      <Hydrate when={media('(min-width: 800px)')} h="2_21aa371e0f">{<_H2 />}</Hydrate>
    </>);
}