import {
	Body,
	Head,
	HeadContent,
	Html,
	Link,
	Outlet,
	Scripts,
	createRootRoute,
} from '@tanstack/octane-router';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'Octane Start E2E' },
		],
	}),
	shellComponent: RootDocument,
	component: RootLayout,
	errorComponent: RouteError,
	notFoundComponent: NotFound,
});

function RootDocument(props: { children?: unknown }) @{
	<Html lang="en">
		<Head>
			<HeadContent />
		</Head>
		<Body>
			{props.children}
			<Scripts />
		</Body>
	</Html>
}

function RootLayout() @{
	<>
		<nav>
			<Link to="/">Home</Link>
			<Link to="/about">About</Link>
			<Link to="/deferred">Deferred</Link>
		</nav>
		<main>
			<Outlet />
		</main>
	</>
}

function RouteError(props) @{
	<section data-testid="route-error">
		<h1>{'Route error'}</h1>
		<p>{props.error instanceof Error ? props.error.message : String(props.error)}</p>
	</section>
}

function NotFound() @{
	<section data-testid="not-found">
		<h1>{'Not found'}</h1>
	</section>
}
