import { use } from 'octane';
import { hydrate } from '@tanstack/router-core/ssr/client';
import { RouterProvider } from '../RouterProvider.tsrx';
import { toExternalHydrationThenable } from '../externalHydration.ts';

const hydrationPromises = new WeakMap();
const ready = {
	status: 'fulfilled',
	value: undefined,
	then(onfulfilled) {
		return Promise.resolve(onfulfilled?.());
	},
};

function getHydrationPromise(router) {
	let promise = hydrationPromises.get(router);
	if (!promise) {
		promise = router.stores.matchesId.get().length
			? ready
			: hydrate(router);
		hydrationPromises.set(router, promise);
	}
	return promise;
}

function RouterClientInner(props) @{
	use(toExternalHydrationThenable(getHydrationPromise(props.router)));
	<RouterProvider router={props.router} />
}

export function RouterClient(props) @{
	@try {
		<RouterClientInner router={props.router} />
	} @pending {
		<></>
	}
}
