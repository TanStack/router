// react-router's CatchBoundary + default ErrorComponent, rebuilt on octane's
// `@try`/`@catch` (octane has no class components, so the upstream
// CatchBoundaryImpl class becomes a catch branch). Contract preserved from
// upstream CatchBoundary.tsx:
//   - renders `children` until a descendant throws during render/effects;
//   - then renders `errorComponent` with `{ error, reset }`;
//   - `onCatch(error, errorInfo)` fires once per caught error (componentDidCatch
//     parity). It runs during the catch-branch render — BEFORE the error UI — so
//     an onCatch that rethrows (Match forwards `notFound()` errors this way)
//     propagates to the parent boundary exactly like a throwing componentDidCatch;
//   - when `getResetKey()` changes while an error is showing, the boundary resets
//     and re-renders `children` (upstream clears the error in
//     getDerivedStateFromProps; here a layout effect calls the catch reset — one
//     commit later, same observable outcome). Match passes the router's `loadedAt`
//     so navigation clears route error UI.
import { useState, useRef, useLayoutEffect } from 'octane';

declare const process: { env: { NODE_ENV?: string } };

export function CatchBoundary(props) @{
	@try {
		<>
			{props.children}
		</>
	} @catch (error, reset) {
		<CatchErrorView
			error={error}
			reset={reset}
			getResetKey={props.getResetKey}
			errorComponent={props.errorComponent}
			onCatch={props.onCatch}
		/>
	}
}

function CatchErrorView(props) @{
	// componentDidCatch parity — once per distinct caught error, during render so a
	// rethrow (the notFound-forwarding path) escapes to the parent boundary.
	const reported = useRef(null);
	if (reported.current !== props.error) {
		reported.current = props.error;
		if (props.onCatch) {
			props.onCatch(props.error, { componentStack: '' });
		}
	}

	// Reset when the reset key rolls (navigation). Skip the mount render — the key
	// captured while catching is the baseline.
	const resetKey =
		props.getResetKey ? props.getResetKey() : undefined;
	const keyRef = useRef(resetKey);
	useLayoutEffect(() => {
		if (keyRef.current !== resetKey) {
			keyRef.current = resetKey;
			props.reset();
		}
	}, [resetKey]);

	const ErrorComp = props.errorComponent ?? ErrorComponent;

	<ErrorComp error={props.error} reset={props.reset} info={{ componentStack: '' }} />
}

// The default error UI, markup-identical to react-router's ErrorComponent (string
// styles serialize to the same inline css React produces, so the differential rig
// can byte-compare it).
export function ErrorComponent(props) @{
	const [show, setShow] = useState(process.env.NODE_ENV !== 'production');

	<div style="padding:.5rem;max-width:100%">
		<div style="display:flex;align-items:center;gap:.5rem">
			<strong style="font-size:1rem">Something went wrong!</strong>
			<button
				style="appearance:none;font-size:.6em;border:1px solid currentColor;padding:.1rem .2rem;font-weight:bold;border-radius:.25rem"
				onClick={() => setShow((d) => !d)}
			>
				{show ? 'Hide Error' : 'Show Error'}
			</button>
		</div>
		<div style="height:.25rem"></div>
		@if (show) {
			<div>
				<pre
					style="font-size:.7em;border:1px solid red;border-radius:.25rem;padding:.3rem;color:red;overflow:auto"
				>
					@if (props.error?.message) {
						<code>
							{props.error.message as string}
						</code>
					}
				</pre>
			</div>
		}
	</div>
}
