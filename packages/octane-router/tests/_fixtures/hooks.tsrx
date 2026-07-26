import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	getRouteApi,
	Outlet,
	useMatch,
	useParams,
	useSearch,
	useLoaderData,
	useLoaderDeps,
	useRouteContext,
	useMatches,
	useParentMatches,
	useChildMatches,
	useNavigate,
	useCanGoBack,
} from '@tanstack/octane-router';

function RootLayout() @{
	<div class="root">
		<Outlet />
	</div>
}

// The nearest-match contract: a LAYOUT calling useParams()/useMatch() with no
// `from` must resolve ITS OWN match, not the leaf's.
function ItemsLayout() @{
	const params = useParams();
	const match = useMatch();
	<section class="items">
		<p class="layout-params">{JSON.stringify(params)}</p>
		<p class="layout-route">
			{match.routeId as string}
		</p>
		<Outlet />
	</section>
}

let itemRoute: any;

function ItemPage() @{
	const params = useParams();
	const loaderData = itemRoute.useLoaderData();
	const deps = useLoaderDeps();
	const context = useRouteContext();
	const matches = useMatches();
	const parents = useParentMatches();
	const children = useChildMatches();
	<article class="item">
		<p class="item-params">{JSON.stringify(params)}</p>
		<p class="item-loader">{String(loaderData)}</p>
		<p class="item-deps">{JSON.stringify(deps)}</p>
		<p class="item-context">{String(context.fromBeforeLoad)}</p>
		<p class="item-counts">
			{matches.length + '/' + parents.length + '/' + children.length}
		</p>
	</article>
}

// getRouteApi consumer — reads its route's data by id without importing the
// route object (the code-split shape).
const summaryApi = getRouteApi('/items/summary/$id');

function ItemSummary() @{
	const loaderData = summaryApi.useLoaderData();
	const params = summaryApi.useParams();
	<p class="api-summary">
		{String(loaderData) + ':' + params.id}
	</p>
}

function HomePage() @{
	const canGoBack = useCanGoBack();
	const navigate = useNavigate();
	<div class="home">
		<p class="can-go-back">{String(canGoBack)}</p>
		<button
			class="go-items"
			onClick={() => navigate({ to: '/items/i7', search: { tab: 'specs' } })}
		>{'go'}</button>
	</div>
}

// Captures useNavigate identity across re-renders (stability check).
export const navigateIdentities: any[] = [];

function SearchPage() @{
	const search = useSearch();
	const navigate = useNavigate();
	navigateIdentities.push(navigate);
	<p class="search">{JSON.stringify(search)}</p>
}

export function makeHooksRouter(initial: string) {
	navigateIdentities.length = 0;
	const rootRoute = createRootRoute({ component: RootLayout });
	const homeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: HomePage,
	});
	const itemsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'items',
		component: ItemsLayout,
	});
	itemRoute = createRoute({
		getParentRoute: () => itemsRoute,
		path: '$id',
		component: ItemPage,
		validateSearch: (search: Record<string, unknown>) => ({ tab: search.tab as string ?? 'all' }),
		loaderDeps: ({ search }: any) => ({ tab: search.tab }),
		beforeLoad: () => ({ fromBeforeLoad: 'ctx-value' }),
		loader: ({ params }: any) => 'loaded-' + params.id,
	});
	const summaryRoute = createRoute({
		getParentRoute: () => itemsRoute,
		path: 'summary/$id',
		component: ItemSummary,
		loader: ({ params }: any) => 'sum-' + params.id,
	});
	const searchRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'search',
		component: SearchPage,
		validateSearch: (s: Record<string, unknown>) => ({ q: s.q as string ?? '' }),
	});

	return createRouter({
		routeTree: rootRoute.addChildren([
			homeRoute,
			itemsRoute.addChildren([itemRoute, summaryRoute]),
			searchRoute,
		]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
