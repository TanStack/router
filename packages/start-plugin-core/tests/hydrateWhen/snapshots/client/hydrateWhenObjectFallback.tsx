const _Hydrate_3 = _lazyHydratedComponent(() => import("/Users/caligano/source/tanstack/router/packages/start-plugin-core/tests/hydrateWhen/test-files/hydrateWhenObjectFallback.tsx?tss-hydrate=hydrateWhenObjectFallback_ff2f1d1b76&tss-hydrate-index=2"), "Hydrate_2"),
  _Hydrate_2_preload = _Hydrate_3.preload;
const _Hydrate_2 = _lazyHydratedComponent(() => import("/Users/caligano/source/tanstack/router/packages/start-plugin-core/tests/hydrateWhen/test-files/hydrateWhenObjectFallback.tsx?tss-hydrate=hydrateWhenObjectFallback_bdf3670c0a&tss-hydrate-index=1"), "Hydrate_1"),
  _Hydrate_1_preload = _Hydrate_2.preload;
const _Hydrate_ = _lazyHydratedComponent(() => import("/Users/caligano/source/tanstack/router/packages/start-plugin-core/tests/hydrateWhen/test-files/hydrateWhenObjectFallback.tsx?tss-hydrate=hydrateWhenObjectFallback_02e12e6487&tss-hydrate-index=0"), "Hydrate_0"),
  _Hydrate_0_preload = _Hydrate_.preload;
import { lazyHydratedComponent as _lazyHydratedComponent } from "@tanstack/react-start";
import { Hydrate } from '@tanstack/react-start';
import { idle, visible } from '@tanstack/react-start/hydration';
const spreadProps = {
  when: visible(),
  fallback: <div data-testid="bound-spread-fallback">Bound</div>
};
function Widget(props: {
  title: string;
}) {
  return <p>{props.title}</p>;
}
export function Page() {
  return <>
      <Hydrate when={visible()} fallback={<div data-testid="direct-fallback">Direct</div>} splitId="hydrateWhenObjectFallback_02e12e6487" preload={_Hydrate_0_preload}>
      {<_Hydrate_ />}
    </Hydrate>
      <Hydrate {...{
      when: idle(),
      fallback: <div data-testid="inline-spread-fallback">Inline</div>
    }} splitId="hydrateWhenObjectFallback_bdf3670c0a" preload={_Hydrate_1_preload}>
      {<_Hydrate_2 />}
    </Hydrate>
      <Hydrate {...spreadProps} splitId="hydrateWhenObjectFallback_ff2f1d1b76" preload={_Hydrate_2_preload}>
      {<_Hydrate_3 />}
    </Hydrate>
    </>;
}