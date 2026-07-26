// Pass-through wrapper used wherever react-router conditionally omits a boundary
// (Suspense / CatchBoundary / CatchNotFound / shellComponent). Rendering through
// SafeFragment instead of conditionally nesting the template keeps the boundary
// slot's component identity dynamic (`<Wrap>` where Wrap is Suspense or this) and
// — crucially — means a route WITHOUT a pendingComponent/errorComponent does not
// create a boundary at all, so suspensions and errors bubble to the nearest
// ancestor that has one (react-router parity).
export function SafeFragment(props) @{
	<>
		{props.children}
	</>
}
