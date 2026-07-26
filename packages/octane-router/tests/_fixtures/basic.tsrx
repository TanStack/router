import {
	createRouter,
	createRootRoute,
	createRoute,
	Outlet,
	Link,
	useParams,
	notFound,
} from '@tanstack/octane-router';
import { createMemoryHistory } from '@tanstack/octane-router';

// A layout route (no path component of its own) renders chrome + an <Outlet/> for
// the matched child — exercising the match-context chain.
function RootLayout() @{
	<div class="root">
		<nav>
			<Link to="/" class="nav-home">{'Home'}</Link>
			<Link to="/about" class="nav-about">{'About'}</Link>
		</nav>
		<Outlet />
	</div>
}

function IndexPage() @{
	<h1 class="index">{'Index'}</h1>
}

function AboutPage() @{
	<h1 class="about">{'About page'}</h1>
}

function LoadFailurePage() @{
	<h1 class="load-failure">{'Load failure'}</h1>
}

function LoadNotFoundPage() @{
	<h1 class="load-not-found">{'Load not found'}</h1>
}

function EnterFailurePage() @{
	<h1 class="enter-failure">{'Enter failure'}</h1>
}

// Reads a path param via useParams (loose access).
function ItemPage() @{
	const params = useParams({ strict: false });
	<h1 class="item">
		{'Item ' + params.id as string}
	</h1>
}

// A second layout level: posts has its own <Outlet/> for its children, exercising
// a 3-match chain (root → posts → posts-index).
function PostsLayout() @{
	<section class="posts">
		<h2>{'Posts'}</h2>
		<Outlet />
	</section>
}

function PostsIndex() @{
	<p class="posts-index">{'All posts'}</p>
}

// A fresh router (+ fresh route tree) per call so tests don't share router state.
export function makeRouter(initial: string) {
	const rootRoute = createRootRoute({ component: RootLayout });
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: IndexPage,
	});
	const aboutRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/about',
		component: AboutPage,
	});
	const loadFailureRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/load-failure',
		loader: () => {
			throw new Error('load failed');
		},
		component: LoadFailurePage,
	});
	const loadNotFoundRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/load-not-found',
		loader: () => {
			throw notFound();
		},
		component: LoadNotFoundPage,
	});
	const enterFailureRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/enter-failure',
		onEnter: () => {
			throw new Error('enter failed');
		},
		component: EnterFailurePage,
	});
	const itemRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'item/$id',
		component: ItemPage,
	});
	const postsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'posts',
		component: PostsLayout,
	});
	const postsIndexRoute = createRoute({
		getParentRoute: () => postsRoute,
		path: '/',
		component: PostsIndex,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([
			indexRoute,
			aboutRoute,
			loadFailureRoute,
			loadNotFoundRoute,
			enterFailureRoute,
			itemRoute,
			postsRoute.addChildren([postsIndexRoute]),
		]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
