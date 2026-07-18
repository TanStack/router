import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	Outlet,
	notFound,
} from '@tanstack/octane-router';

// Root layout + a nested posts layout, so not-found UI can land at either level.
function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

function IndexPage() @{
	<h1 class="index">{'Index'}</h1>
}

function PostsLayout() @{
	<section class="posts">
		<h2>{'Posts'}</h2>
		<Outlet />
	</section>
}

function PostsIndex() @{
	<p class="posts-index">{'All posts'}</p>
}

// Loader-thrown notFound: `/item/missing` 404s with a data payload, other ids load.
function ItemPage() @{
	<p class="item">{'Item'}</p>
}

function RootNotFound() @{
	<p class="root-notfound">{'Root not found'}</p>
}

function PostsNotFound() @{
	<p class="posts-notfound">{'Posts not found'}</p>
}

function DefaultNotFound() @{
	<p class="default-notfound">{'Default not found'}</p>
}

// The NotFoundError is spread onto the component (react-router's
// renderRouteNotFound), so `notFound({ data })` arrives as the `data` prop.
function ItemNotFound(props) @{
	<p class="item-notfound">
		{'Missing item ' + props.data.id}
	</p>
}

export interface NotFoundRouterOptions {
	/** Give the root route a notFoundComponent (default true). */
	rootNotFound?: boolean;
	/** Give the posts layout route its own notFoundComponent (default false). */
	postsNotFound?: boolean;
	/** Set a router-level defaultNotFoundComponent (default false). */
	defaultNotFound?: boolean;
	/** router-core's notFoundMode ('fuzzy' is TanStack's default). */
	notFoundMode?: 'fuzzy' | 'root';
}

// A fresh router (+ fresh route tree) per call so tests don't share router state.
export function makeRouter(initial: string, opts: NotFoundRouterOptions = {}) {
	const rootRoute = createRootRoute({
		component: RootLayout,
		notFoundComponent: opts.rootNotFound ?? true ? RootNotFound : undefined,
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: IndexPage,
	});
	const postsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'posts',
		component: PostsLayout,
		notFoundComponent: opts.postsNotFound ? PostsNotFound : undefined,
	});
	const postsIndexRoute = createRoute({
		getParentRoute: () => postsRoute,
		path: '/',
		component: PostsIndex,
	});
	const itemRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'item/$id',
		component: ItemPage,
		notFoundComponent: ItemNotFound,
		loader: ({ params }: any) => {
			if (params.id === 'missing') {
				throw notFound({ data: { id: params.id } });
			}
		},
	});
	return createRouter({
		routeTree: rootRoute.addChildren([
			indexRoute,
			postsRoute.addChildren([postsIndexRoute]),
			itemRoute,
		]),
		history: createMemoryHistory({ initialEntries: [initial] }),
		defaultNotFoundComponent: opts.defaultNotFound ? DefaultNotFound : undefined,
		notFoundMode: opts.notFoundMode,
	});
}
