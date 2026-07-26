// useMatchRoute / MatchRoute — port of react-router's Matches.tsx matcher pair.
// The hook subscribes to `matchRouteDeps` (location href + resolved href +
// status) so the matcher re-evaluates per navigation, and returns
// `matchRoute(opts)` → false | matched params. The component renders its
// children when matched — a render-prop child ALWAYS renders, receiving the
// params (false when unmatched).
import { useCallback, isChildrenBlock } from 'octane';
import { useRouter } from './context.ts';
import { useStore } from './useStore.ts';

export function useMatchRoute() {
	const router = useRouter();
	useStore(router.stores.matchRouteDeps, (d) => d);
	return useCallback((opts) => {
		const { pending, caseSensitive, fuzzy, includeSearch, ...rest } = opts;
		return router.matchRoute(rest, { pending, caseSensitive, fuzzy, includeSearch });
	}, [router]);
}

export function MatchRoute(props) @{
	const matchRoute = useMatchRoute();
	const params = matchRoute(props);
	const out =
		typeof props.children === 'function' && !isChildrenBlock(props.children)
			? props.children(params)
			: params
				? props.children
				: null;
	<>
		{out}
	</>
}
