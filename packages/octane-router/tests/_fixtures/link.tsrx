import {
	createRouter,
	createRootRoute,
	createRoute,
	createMemoryHistory,
	Outlet,
	Link,
	createLink,
} from '@tanstack/octane-router';

function RootLayout() @{
	<div class="root">
		<nav>
			<Link to="/" class="l-home">{'Home'}</Link>
			<Link to="/about" class="l-about">{'About'}</Link>
			<Link to="/about-us" class="l-about-us">{'About us'}</Link>
			<Link to="/about" activeOptions={{ exact: true }} class="l-about-exact">{'About exact'}</Link>
			<Link to="/list" search={{ page: 2 }} class="l-list-p2">{'List p2'}</Link>
			<Link to="/list" search={{ page: 2, extra: 'x' }} class="l-list-p2x">{'List p2 extra'}</Link>
			<Link to="https://example.com/docs" class="l-ext">{'External'}</Link>
			<Link to="javascript:alert(1)" class="l-danger">{'Danger'}</Link>
			<Link to="/about" disabled class="l-disabled">{'Disabled'}</Link>
			<Link to="/about" class="l-render">
				{(state) => 'active:' + state.isActive}
			</Link>
			<Link to="/secret" mask={{ to: '/fake' }} class="l-masked">{'Masked'}</Link>
			<Link to="/about" preload="intent" preloadDelay={0} class="l-intent">{'Intent'}</Link>
		</nav>
		<Outlet />
	</div>
}

function Page() @{
	<p class="page">{'page'}</p>
}

// createLink integration — a design-system anchor that renders the built link
// props onto its own markup.
function FancyAnchor(props) @{
	const { children, ...rest } = props;
	<a {...rest} data-fancy="true">{children}</a>
}

export const FancyLink = createLink(FancyAnchor);

function CreateLinkPage() @{
	<div class="cl-page">
		<FancyLink to="/about" class="l-fancy">{'Fancy'}</FancyLink>
	</div>
}

export function makeLinkRouter(initial: string) {
	const rootRoute = createRootRoute({ component: RootLayout });
	const mk = (path: string, component: any = Page) => createRoute({
		getParentRoute: () => rootRoute,
		path,
		component,
	});

	const listRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'list',
		component: Page,
		validateSearch: (s: Record<string, unknown>) => ({
			page: Number(s.page ?? 1),
			...(s.extra ? { extra: s.extra as string } : {}),
		}),
	});

	const routes = [
		mk('/'),
		mk('about'),
		mk('about-us'),
		listRoute,
		mk('secret'),
		mk('fake'),
		mk('cl', CreateLinkPage),
	];

	return createRouter({
		routeTree: rootRoute.addChildren(routes),
		history: createMemoryHistory({ initialEntries: [initial] }),
	});
}
