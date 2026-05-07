const _Hydrate_3 = _lazyHydratedComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=hydrateWhenMultiple_67a68576e2&tss-hydrate-index=2"), "Hydrate_2"),
  _Hydrate_2_preload = _Hydrate_3.preload;
const _Hydrate_2 = _lazyHydratedComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=hydrateWhenMultiple_b697cf73ee&tss-hydrate-index=1"), "Hydrate_1"),
  _Hydrate_1_preload = _Hydrate_2.preload;
const _Hydrate_ = _lazyHydratedComponent(() => import("<fixtureRoot>/hydrateWhenMultiple.tsx?tss-hydrate=hydrateWhenMultiple_60c0370186&tss-hydrate-index=0"), "Hydrate_0"),
  _Hydrate_0_preload = _Hydrate_.preload;
import { lazyHydratedComponent as _lazyHydratedComponent } from "@tanstack/react-start";
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
      <Hydrate when={load()} splitId="hydrateWhenMultiple_60c0370186" preload={_Hydrate_0_preload}>
      {<_Hydrate_ />}
    </Hydrate>
      <Hydrate when={visible()} splitId="hydrateWhenMultiple_b697cf73ee" preload={_Hydrate_1_preload}>
      {<_Hydrate_2 />}
    </Hydrate>
      <Hydrate when={media('(min-width: 800px)')} splitId="hydrateWhenMultiple_67a68576e2" preload={_Hydrate_2_preload}>
      {<_Hydrate_3 />}
    </Hydrate>
    </>;
}