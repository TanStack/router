import { lazyRouteComponent as _lazyRouteComponent } from "@tanstack/react-router";
const _H0 = _lazyRouteComponent(() => import("<fixtureRoot>/hydrateWhenPrefetchState.tsx?tss-hydrate=0_24b5f958eb"), "H0");
const _H0_preload = _H0.preload;
import { useState } from 'react';
import { Hydrate } from '@tanstack/react-start';
import { interaction } from '@tanstack/react-start/hydration';
export function Page() {
  const [status, setStatus] = useState('idle');
  const [, setUnusedStatus] = useState('idle');
  return (<section>
      <p>{status}</p>
      <Hydrate when={interaction()} prefetch={async () => {
    setStatus('prefetched');
    setUnusedStatus('prefetched');
  }} h="0_24b5f958eb" p={_H0_preload}>{<_H0 />}</Hydrate>
    </section>);
}