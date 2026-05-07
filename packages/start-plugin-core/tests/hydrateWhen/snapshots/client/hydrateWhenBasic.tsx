const _Hydrate_ = _lazyHydratedComponent(() => import("<fixtureRoot>/hydrateWhenBasic.tsx?tss-hydrate=hydrateWhenBasic_ea3b43bf45&tss-hydrate-index=0"), "Hydrate_0"),
  _Hydrate_0_preload = _Hydrate_.preload;
import { lazyHydratedComponent as _lazyHydratedComponent } from "@tanstack/react-start";
import { Hydrate } from '@tanstack/react-start';
import { idle, visible } from '@tanstack/react-start/hydration';
import { Chart, FallbackPane } from './widgets';
import { formatValue } from './format';
const chartTitle = formatValue('Revenue');
export function Page() {
  return <section>
      <Hydrate when={visible({
      rootMargin: '200px',
      threshold: 0.25
    })} prefetch={idle({
      timeout: 100
    })} fallback={<FallbackPane label="chart" />} splitId="hydrateWhenBasic_ea3b43bf45" preload={_Hydrate_0_preload}>
      {<_Hydrate_ />}
    </Hydrate>
    </section>;
}