const _H3 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=2_21aa371e0f"), "H2");
const _H2 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=1_21aa371e0f"), "H1");
const _H = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=0_21aa371e0f"), "H0");
import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";
import { Hydrate } from '@tanstack/react-start';
import { load, media, visible } from '@tanstack/react-start/hydration';
function Summary() {
  return <section>Summary</section>;
}
function Comments() {
  return <section>Comments</section>;
}
function Footer() {
  return <footer>Footer</footer>;
}
export function Page() {
  return <>
      <Hydrate when={load()} h="0_21aa371e0f">
      {<_H />}
    </Hydrate>
      <Hydrate when={visible()} h="1_21aa371e0f">
      {<_H2 />}
    </Hydrate>
      <Hydrate when={media('(min-width: 800px)')} h="2_21aa371e0f">
      {<_H3 />}
    </Hydrate>
    </>;
}