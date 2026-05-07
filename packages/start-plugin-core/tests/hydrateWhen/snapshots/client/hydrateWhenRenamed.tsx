const _Hydrate_ = _lazyHydratedComponent(() => import("<fixtureRoot>/hydrateWhenRenamed.tsx?tss-hydrate=hydrateWhenRenamed_ad6838514c&tss-hydrate-index=0"), "Hydrate_0"),
  _Hydrate_0_preload = _Hydrate_.preload;
import { lazyHydratedComponent as _lazyHydratedComponent } from "@tanstack/react-start";
import { Hydrate as HW } from '@tanstack/react-start';
import { interaction } from '@tanstack/react-start/hydration';
function SearchBox() {
  return <input aria-label="Search" />;
}
export function Page() {
  return <HW when={interaction({
    events: 'focusin'
  })} splitId="hydrateWhenRenamed_ad6838514c" preload={_Hydrate_0_preload}>
    {<_Hydrate_ />}
  </HW>;
}