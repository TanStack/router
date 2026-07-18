// useBlocker / Block — port of react-router's useBlocker.tsx. Registers a
// history blocker (`history.block`) whose composed blockerFn resolves the
// current/next locations to matched-route shapes, asks `shouldBlockFn`, and —
// with `withResolver` — parks the navigation in a promise the caller settles
// via the returned resolver's `proceed()` / `reset()`. Also supports the legacy
// `(blockerFn, condition)` and `{ blockerFn, condition }` signatures. Authored
// in .tsrx so the compiler slots the internal useState/useEffect and callers'
// withSlot wrapping keeps per-call-site state independent.
import { useState, useEffect, isChildrenBlock } from 'octane';
import { useRouter } from './context.ts';

const IDLE_RESOLVER = {
	status: 'idle',
	current: undefined,
	next: undefined,
	action: undefined,
	proceed: undefined,
	reset: undefined,
};

function _resolveBlockerOpts(opts, condition) {
	if (opts === undefined) {
		return { shouldBlockFn: () => true, withResolver: false };
	}
	if ('shouldBlockFn' in opts) {
		return opts;
	}
	if (typeof opts === 'function') {
		const shouldBlock = Boolean(condition ?? true);
		const _customBlockerFn = async () => {
			if (shouldBlock) {
				return await opts();
			}
			return false;
		};
		return {
			shouldBlockFn: _customBlockerFn,
			enableBeforeUnload: shouldBlock,
			withResolver: false,
		};
	}
	const shouldBlock = Boolean(opts.condition ?? true);
	const fn = opts.blockerFn;
	const _customBlockerFn = async () => {
		if (shouldBlock && fn !== undefined) {
			return await fn();
		}
		return shouldBlock;
	};
	return {
		shouldBlockFn: _customBlockerFn,
		enableBeforeUnload: shouldBlock,
		withResolver: fn === undefined,
	};
}

export function useBlocker(opts, condition) {
	const { shouldBlockFn, enableBeforeUnload = true, disabled = false, withResolver = false } =
		_resolveBlockerOpts(opts, condition);

	const router = useRouter();
	const { history } = router;

	const [resolver, setResolver] = useState(IDLE_RESOLVER);

	useEffect(() => {
		const blockerFnComposed = async (blockerFnArgs) => {
			function getLocation(location) {
				const parsedLocation = router.parseLocation(location);
				const matchedRoutes = router.getMatchedRoutes(parsedLocation.pathname);
				if (matchedRoutes.foundRoute === undefined) {
					return {
						routeId: '__notFound__',
						fullPath: parsedLocation.pathname,
						pathname: parsedLocation.pathname,
						params: matchedRoutes.routeParams,
						search: router.options.parseSearch(location.search),
					};
				}
				return {
					routeId: matchedRoutes.foundRoute.id,
					fullPath: matchedRoutes.foundRoute.fullPath,
					pathname: parsedLocation.pathname,
					params: matchedRoutes.routeParams,
					search: router.options.parseSearch(location.search),
				};
			}

			const current = getLocation(blockerFnArgs.currentLocation);
			const next = getLocation(blockerFnArgs.nextLocation);

			if (current.routeId === '__notFound__' && next.routeId !== '__notFound__') {
				return false;
			}

			const shouldBlock = await shouldBlockFn({
				action: blockerFnArgs.action,
				current,
				next,
			});
			if (!withResolver) {
				return shouldBlock;
			}
			if (!shouldBlock) {
				return false;
			}

			const promise = new Promise((resolve) => {
				setResolver({
					status: 'blocked',
					current,
					next,
					action: blockerFnArgs.action,
					proceed: () => resolve(false),
					reset: () => resolve(true),
				});
			});

			const canNavigateAsync = await promise;
			setResolver(IDLE_RESOLVER);
			return canNavigateAsync;
		};

		return disabled
			? undefined
			: history.block({ blockerFn: blockerFnComposed, enableBeforeUnload });
	}, [shouldBlockFn, enableBeforeUnload, disabled, withResolver, history, router]);

	return resolver;
}

// Declarative blocker: registers useBlocker and renders children (optionally a
// render prop receiving the resolver).
export function Block(props) @{
	const { children, ...rest } = props;
	const resolver = useBlocker(rest);
	const out =
		children
			? typeof children === 'function' && !isChildrenBlock(children)
				? children(resolver)
				: children
			: null;
	<>
		{out}
	</>
}
