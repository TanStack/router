// A navigating anchor — a thin shell over `useLinkProps` (link.ts), which
// carries ALL of react-router Link's behavior: href building (mask-aware),
// external-URL + dangerous-protocol handling, active-state detection,
// preloading (intent/viewport/render), and the navigate click handler with
// replace/resetScroll/hashScrollIntoView/viewTransition/startTransition/
// ignoreBlocker forwarded. Children may be a render prop —
// `{({ isActive, isTransitioning }) => …}` — and `createLink` renders a custom
// component via the internal `_asChild` prop. Ref is a prop (octane's model —
// no forwardRef); `disabled` renders without an href + role="link" (upstream
// drops the anchor's disabled attribute; the aria props carry the state).
import { isChildrenBlock } from 'octane';
import { useLinkProps } from './link.ts';

export function Link(props) @{
	const { _asChild: AsChild, children, ...rest } = props;
	const linkProps = useLinkProps(rest);
	const { disabled: _disabled, ...aProps } = linkProps;

	const resolvedChildren =
		typeof children === 'function' && !isChildrenBlock(children)
			? children({
					isActive: linkProps['data-status'] === 'active',
					isTransitioning: linkProps['data-transitioning'] === 'transitioning',
				})
			: children;

	@if (AsChild) {
		<AsChild {...linkProps}>{resolvedChildren}</AsChild>
	} @else {
		<a {...aProps}>{resolvedChildren}</a>
	}
}
