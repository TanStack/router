import {
	createRouter,
	createRootRoute,
	createRoute,
	Outlet,
	createMemoryHistory,
} from '@tanstack/octane-router';
import { use } from 'octane';

// A layout that just renders an <Outlet/> for the active route.
function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

// A stable, never-suspending home route — the marker the concurrent transition
// must KEEP on screen while the next route is loading.
function HomePage() @{
	<h1 class="home">{'Home'}</h1>
}

// A distinct pendingComponent ('.slow-pending') so we can assert the fallback is
// NOT shown while the transition holds the old page.
function SlowPending() @{
	<div class="slow-pending">{'Loading slow…'}</div>
}

// A deferred whose resolution the test drives manually, so the suspense window
// is fully deterministic (no timers).
export interface Deferred<T> {
	promise: Promise<T>;
	resolve: (value: T) => void;
}

export function createDeferred<T>(): Deferred<T> {
	let resolve: ((value: T) => void) | undefined;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve: (value: T) => resolve!(value) };
}

// The slow route component suspends on the active deferred via `use()`. The
// deferred is supplied per-router through the route's loaderData-free `context`
// is awkward, so we stash it on a module-level holder keyed by router (set in
// makeConcurrentRouter). Defining the component at module top level is required —
// the compiler only compiles `@{ }` component bodies declared at module scope.
let activePromise: Promise<string> | null = null;

function SlowPage() @{
	const value = use(activePromise!);
	<h1 class="slow">
		{value as string}
	</h1>
}

// Builds a router whose '/slow' route suspends on `deferred.promise`.
export function makeConcurrentRouter(initial: string, deferred: Deferred<string>) {
	activePromise = deferred.promise;

	const rootRoute = createRootRoute({ component: RootLayout });
	const homeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: HomePage,
	});
	const slowRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'slow',
		component: SlowPage,
		pendingComponent: SlowPending,
	});
	// Same suspending component, but NO pendingComponent — so no Suspense boundary
	// mounts for it and a navigation transition must hold the old page instead.
	const slowBareRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'slow-bare',
		component: SlowPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([homeRoute, slowRoute, slowBareRoute]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
