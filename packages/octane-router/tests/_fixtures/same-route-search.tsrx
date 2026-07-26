import {
	createRouter,
	createRootRoute,
	createRoute,
	Outlet,
	useSearch,
	useRouterState,
	createMemoryHistory,
} from '@tanstack/octane-router';
import { use } from 'octane';

// A layout that just renders an <Outlet/> for the active route.
function RootLayout() @{
	const isLoading = useRouterState({ select: (s: any) => s.isLoading });
	<div class="root" data-loading={String(isLoading)}>
		<Outlet />
	</div>
}

// A distinct pendingComponent so the test can assert the route's fallback is NOT
// shown while the transition holds the current page during a same-route
// search-param change.
function StoriesPending() @{
	<div class="stories-pending">{'Loading page…'}</div>
}

// Per-page deferreds, resolved manually by the test so the suspense window is
// fully deterministic. Keyed by page number; `deferredFor(page)` returns the same
// promise for the same page so `use()` suspends until the test resolves it.
export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

function makeDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve: (value: T) => resolve!(value) };
}

const deferreds = new Map<number, Deferred<string>>();

export function deferredFor(page: number): Deferred<string> {
	let d = deferreds.get(page);
	if (!d) {
		d = makeDeferred<string>();
		deferreds.set(page, d);
	}
	return d;
}

export function resetDeferreds(): void {
	deferreds.clear();
}

// The data view suspends on its `page` PROP's deferred. It does not subscribe to
// any router store itself — it only re-renders when its parent re-renders with a
// new `page`. So the render priority of THIS re-render (and its suspend) is
// inherited from the parent's re-render, which is driven by the router's
// search-param commit.
function PageView(props: { page: number }) @{
	const value = use(deferredFor(props.page).promise);
	<h1 class="stories" data-page={String(props.page)}>
		{value as string}
	</h1>
}

// The route component reads the `?page` search param and passes it to PageView.
// A same-route `?page=1` → `?page=2` change updates the search this component
// observes; PageView then suspends on page=2's deferred. Because the navigation
// rides the concurrent-navigation transition, octane should HOLD the page=1
// content rather than flash the route's pending fallback.
function StoriesPage() @{
	const page = useSearch({ select: (s: any) => s.page ?? 1 }) as number;
	<PageView page={page} />
}

// Builds a single-route router whose '/' route reads `?page` and suspends per page.
export function makeSameRouteSearchRouter(
	initial: string,
	options: { isServer?: boolean } = {},
) {
	const rootRoute = createRootRoute({ component: RootLayout });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: StoriesPage,
		pendingComponent: StoriesPending,
		validateSearch: (search: Record<string, unknown>) => ({
			page: search.page != null ? Number(search.page) : 1,
		}),
	});
	return createRouter({
		routeTree: rootRoute.addChildren([indexRoute]),
		history: createMemoryHistory({ initialEntries: [initial] }),
		isServer: options.isServer,
	});
}
