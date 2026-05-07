const _Hydrate_2 = _lazyHydratedComponent(() => import("/Users/caligano/source/tanstack/router/packages/start-plugin-core/tests/hydrateWhen/test-files/hydrateWhenNested.tsx?tss-hydrate=hydrateWhenNested_383a2d73fd&tss-hydrate-index=2"), "Hydrate_2"),
  _Hydrate_2_preload = _Hydrate_2.preload;
const _Hydrate_ = _lazyHydratedComponent(() => import("/Users/caligano/source/tanstack/router/packages/start-plugin-core/tests/hydrateWhen/test-files/hydrateWhenNested.tsx?tss-hydrate=hydrateWhenNested_27eaf98771&tss-hydrate-index=0"), "Hydrate_0"),
  _Hydrate_0_preload = _Hydrate_.preload;
import { lazyHydratedComponent as _lazyHydratedComponent } from "@tanstack/react-start";
import { Hydrate } from '@tanstack/react-start';
import { idle, interaction, visible } from '@tanstack/react-start/hydration';
const unused = 'remove me from virtual modules';
function Outer() {
  return <section>Outer</section>;
}
function NestedButton() {
  return <button>Nested</button>;
}
function Sibling() {
  return <aside>Sibling</aside>;
}
export function Page() {
  return <>
      <Hydrate when={visible()} splitId="hydrateWhenNested_27eaf98771" __hydrate={interaction()} preload={_Hydrate_0_preload}>
      {<_Hydrate_ />}
    </Hydrate>
      <Hydrate when={idle()} splitId="hydrateWhenNested_383a2d73fd" preload={_Hydrate_2_preload}>
      {<_Hydrate_2 />}
    </Hydrate>
    </>;
}