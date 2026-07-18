// CatchNotFound — a CatchBoundary specialized to `notFound()` errors (port of
// react-router's not-found.tsx). Anything that isn't a NotFoundError is rethrown
// (from onCatch during the catch render) so it reaches the next error boundary
// up; the reset key is `not-found-${pathname}-${status}` so navigating away (or a
// new load settling) clears the not-found UI.
import { isNotFound } from '@tanstack/router-core';
import { useRouter } from './context.ts';
import { useStore } from './useStore.ts';
import { CatchBoundary } from './CatchBoundary.tsrx';

function NotFoundFallback(props) {
	if (isNotFound(props.error)) {
		return props.render ? props.render(props.error) : null;
	}
	throw props.error;
}

export function CatchNotFound(props) @{
	const router = useRouter();
	const pathname = useStore(router.stores.location, (l) => l.pathname);
	const status = useStore(router.stores.status, (s) => s);
	const resetKey = `not-found-${pathname}-${status}`;

	<CatchBoundary
		getResetKey={() => resetKey}
		onCatch={(error, errorInfo) => {
			if (isNotFound(error)) {
				if (props.onCatch) {
					props.onCatch(error, errorInfo);
				}
			} else {
				throw error;
			}
		}}
		errorComponent={(p) => NotFoundFallback({ error: p.error, render: props.fallback })}
	>{props.children}</CatchBoundary>
}

export function DefaultGlobalNotFound() @{
	<p>Not Found</p>
}
