import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";
const _H0 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenNested.tsx?tss-hydrate=0_466696e41d"), "H0");
const _H2 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenNested.tsx?tss-hydrate=2_466696e41d"), "H2");
import { Hydrate } from '@tanstack/react-start';
import { idle, visible } from '@tanstack/react-start/hydration';
const unused = 'remove me from virtual modules';
export function Page() {
  return (<>
      <Hydrate when={visible()} h="0_466696e41d">{<_H0 />}</Hydrate>
      <Hydrate when={idle()} h="2_466696e41d">{<_H2 />}</Hydrate>
    </>);
}