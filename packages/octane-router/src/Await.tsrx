// Suspends on a deferred promise and renders its child — a render-prop
// `(data) => <jsx/>` — with the resolved value. `AwaitInner` does the `use(promise)`
// inside a `@try`/`@pending` boundary; the render function is handed to it as a
// `render` prop (re-passing it as `{children}` would be an identifier, not a literal
// render-prop, so the consumer's `<Await>{(d) => …}</Await>` stays the public API).
import { use } from 'octane';
import { toExternalHydrationThenable } from './externalHydration.ts';

function AwaitInner(props) {
	const data = use(toExternalHydrationThenable(props.promise));
	return props.render(data);
}

export function Await(props) @{
	@try {
		<AwaitInner promise={props.promise} render={props.children} />
	} @pending {
		<>
			{props.fallback}
		</>
	}
}
