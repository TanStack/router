// Restores scroll position across navigations. router-core's
// `setupScrollRestoration` does all the work (save on scroll keyed by location,
// restore on navigation) — the component just wires it on mount and renders nothing.
// You can also enable it via `createRouter({ scrollRestoration: true })` (handled in
// Matches); use one or the other.
import { useLayoutEffect } from 'octane';
import { setupScrollRestoration } from '@tanstack/router-core';
import { useRouter } from './context.ts';

export function ScrollRestoration() @{
	const router = useRouter();
	useLayoutEffect(() => {
		setupScrollRestoration(router, true);
	}, [router]);
	<></>
}
