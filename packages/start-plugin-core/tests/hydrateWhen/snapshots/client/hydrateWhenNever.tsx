const _Hydrate_ = _lazyHydratedComponent(() => import("<fixtureRoot>/hydrateWhenNever.tsx?tss-hydrate=hydrateWhenNever_9a00c8d701&tss-hydrate-index=0"), "Hydrate_0"),
  _Hydrate_0_preload = _Hydrate_.preload;
import { lazyHydratedComponent as _lazyHydratedComponent } from "@tanstack/react-start";
import { Hydrate } from '@tanstack/react-start';
import { never } from '@tanstack/react-start/hydration';
function StaticMarketingBlock() {
  return <section>Static marketing</section>;
}
export function Page() {
  return <Hydrate when={never()} splitId="hydrateWhenNever_9a00c8d701" preload={_Hydrate_0_preload}>
    {<_Hydrate_ />}
  </Hydrate>;
}