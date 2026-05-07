const _Hydrate_ = _lazyHydratedComponent(() => import("<fixtureRoot>/hydrateWhenNested.tsx?tss-hydrate=hydrateWhenNested_895e8f985c&tss-hydrate-index=1"), "Hydrate_1"),
  _Hydrate_1_preload = _Hydrate_.preload;
import { lazyHydratedComponent as _lazyHydratedComponent } from "@tanstack/react-start";
import { Hydrate } from '@tanstack/react-start';
import { interaction } from '@tanstack/react-start/hydration';
function Outer() {
  return <section>Outer</section>;
}
function NestedButton() {
  return <button>Nested</button>;
}
export function Hydrate_0({}) {
  return <>
        <Outer />
        <Hydrate when={interaction()} splitId="hydrateWhenNested_895e8f985c" preload={_Hydrate_1_preload}>
      {<_Hydrate_ />}
    </Hydrate>
      </>;
}