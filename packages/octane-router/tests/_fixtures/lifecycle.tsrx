import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	Outlet,
	notFound,
} from '@tanstack/octane-router';

function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

function HomePage() @{
	<h1 class="home">{'Home'}</h1>
}

function PlainPage() @{
	<p class="plain">{'Plain'}</p>
}

// Throws while `shouldThrow` is set — the error-boundary reset tests flip it off
// and invalidate to prove the boundary resets and re-renders the recovered body.
let shouldThrow = true;
export function setThrow(v: boolean) {
	shouldThrow = v;
}

function BoomPage() @{
	if (shouldThrow) {
		throw new Error('boom');
	}
	<p class="boom-ok">{'recovered'}</p>
}

function RouteError(props) @{
	<p class="route-error">
		{'route error: ' + props.error.message}
	</p>
}

function DefaultError(props) @{
	<p class="default-error">
		{'default error: ' + props.error.message}
	</p>
}

// Loader-driven pending: the loader hangs on a deferred the test resolves.
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

let loaderDeferred: Deferred<string> | null = null;

function LoaderPending() @{
	<p class="loader-pending">{'loader pending'}</p>
}

function LoaderDone() @{
	<p class="loader-done">{'loader done'}</p>
}

// Render-thrown notFound: caught by CatchNotFound, renders the route's
// notFoundComponent (loader-thrown notFound is covered in not-found.test.ts).
function NfInRender() {
	throw notFound();
}

function NfComponent() @{
	<p class="nf-render">{'nf in render'}</p>
}

function DefaultComp() @{
	<p class="default-comp">{'default component'}</p>
}

export interface LifecycleRouterOptions {
	/** Give /boom a route-level errorComponent (default true). */
	routeError?: boolean;
	/** Set a router-level defaultErrorComponent (default false). */
	defaultError?: boolean;
	/** onCatch spies. */
	onCatch?: (error: any, info: any) => void;
	defaultOnCatch?: (error: any, info: any) => void;
	/** Router-level defaultComponent (default set — /plain-default has no component). */
	defaultComponent?: boolean;
	/** Loader deferred for /slow-loader. */
	deferred?: Deferred<string>;
}

export function makeLifecycleRouter(initial: string, opts: LifecycleRouterOptions = {}) {
	loaderDeferred = opts.deferred ?? null;

	const rootRoute = createRootRoute({ component: RootLayout });
	const homeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: HomePage,
	});
	const plainRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'plain',
		component: PlainPage,
	});
	const boomRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'boom',
		component: BoomPage,
		errorComponent: opts.routeError ?? true ? RouteError : undefined,
		onCatch: opts.onCatch,
	});
	const slowLoaderRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'slow-loader',
		component: LoaderDone,
		pendingComponent: LoaderPending,
		pendingMs: 1,
		// router-core defaults pendingMinMs to 500ms (once pending UI shows it
		// stays up that long; runLoader awaits the window) — keep the test fast.
		pendingMinMs: 1,
		loader: () => loaderDeferred!.promise,
	});
	const nfRenderRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'nf-render',
		component: NfInRender,
		notFoundComponent: NfComponent,
	});
	const defaultCompRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'plain-default',
	});

	return createRouter({
		routeTree: rootRoute.addChildren([
			homeRoute,
			plainRoute,
			boomRoute,
			slowLoaderRoute,
			nfRenderRoute,
			defaultCompRoute,
		]),
		history: createMemoryHistory({ initialEntries: [initial] }),
		defaultErrorComponent: opts.defaultError ? DefaultError : undefined,
		defaultOnCatch: opts.defaultOnCatch,
		defaultComponent: opts.defaultComponent ?? true ? DefaultComp : undefined,
	});
}
