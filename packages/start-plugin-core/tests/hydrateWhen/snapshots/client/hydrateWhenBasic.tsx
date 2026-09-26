import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";
const _H0 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenBasic.tsx?tss-hydrate=0_3cf0187f82"), "H0");
const _H0_preload = _H0.preload;
import { Hydrate } from '@tanstack/react-start';
import { idle, visible } from '@tanstack/react-start/hydration';
import { FallbackPane } from './widgets';
export function Page() {
  return (<section>
      <Hydrate when={visible({ rootMargin: '200px', threshold: 0.25 })} prefetch={idle({ timeout: 100 })} fallback={<FallbackPane label="chart" />} h="0_3cf0187f82" p={_H0_preload}>{<_H0 />}</Hydrate>
    </section>);
}