import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	RouterProvider,
	Outlet,
	Link,
	useParams,
} from '@tanstack/octane-router';
import { useState } from 'octane';

// Differential fixture: the SAME app runs through @tanstack/octane-router (octane) and
// real @tanstack/react-router (React) — nav links with active state, a params
// route, and a not-found route. The router is created per-mount (useState
// initializer) so each side gets its own instance + memory history.

function RootLayout() @{
	<div class="app">
		<nav>
			{/* className (not class): the React oracle's Link only reads className */}
			<Link to="/" className="nav-home">{'Home'}</Link>
			<Link to="/about" className="nav-about">{'About'}</Link>
			<Link to="/items/i1" className="nav-item">{'Item 1'}</Link>
		</nav>
		<Outlet />
	</div>
}

function HomePage() @{
	<h1 class="home">{'Home'}</h1>
}

function AboutPage() @{
	<h1 class="about">{'About'}</h1>
}

function ItemPage() @{
	const params = useParams({ strict: false });
	<h1 class="item">
		{'Item ' + params.id}
	</h1>
}

function NotFoundPage() @{
	<p class="nf">{'Not found'}</p>
}

function makeRouter(initial: string) {
	const rootRoute = createRootRoute({
		component: RootLayout,
		notFoundComponent: NotFoundPage,
	});
	const homeRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: HomePage,
	});
	const aboutRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'about',
		component: AboutPage,
	});
	const itemRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'items/$id',
		component: ItemPage,
	});
	return createRouter({
		routeTree: rootRoute.addChildren([homeRoute, aboutRoute, itemRoute]),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}

export function BasicApp(props) @{
	const [router] = useState(() => makeRouter(props?.initial ?? '/'));
	<RouterProvider router={router} />
}
