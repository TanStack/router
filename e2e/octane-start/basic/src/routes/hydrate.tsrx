import { useEffect } from 'octane';
import { Hydrate } from '@tanstack/octane-start';
import { interaction } from '@tanstack/octane-start/hydration';
import { ClientOnly, createFileRoute } from '@tanstack/octane-router';
import { ClientOnlyProof } from '../client-only-proof.client.tsrx';
import { DeferredHydrationProof } from '../deferred-hydration-proof.tsrx';

export const Route = createFileRoute('/hydrate')({
	component: HydrateRoute,
});

function HydrateRoute() @{
	useEffect(() => {
		const browserProof = globalThis as typeof globalThis & {
			__octaneStartHydrateRouteReady?: boolean;
		};
		browserProof.__octaneStartHydrateRouteReady = true;
	}, []);

	<section>
		<h1>{'Deferred hydration'}</h1>
		<p data-testid="hydrate-eager">{'eager route content'}</p>
		<Hydrate when={interaction({ events: 'click' })}>
			<DeferredHydrationProof />
		</Hydrate>
		<ClientOnly fallback={<p data-testid="client-only-fallback">{'server fallback'}</p>}>
			<ClientOnlyProof />
		</ClientOnly>
	</section>
}
