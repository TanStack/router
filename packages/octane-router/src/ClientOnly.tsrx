// ClientOnly / useHydrated — port of react-router's ClientOnly.tsx. Renders
// children only once the client has hydrated: `useHydrated` reads a constant
// external store whose server snapshot is `false` and client snapshot is
// `true`, so SSR (and the hydration render) yield the fallback and the first
// client-only render onward yields the children. Authored in .tsrx so the
// compiler slots the hook calls (and withSlot-disambiguates useHydrated's
// call sites).
import { useSyncExternalStore } from 'octane';
import { splitSlot, subSlot } from './internal.ts';

const subscribe = () => () => {};

export function useHydrated(...args) {
	const [, slot] = splitSlot(args);
	return useSyncExternalStore(
		subscribe,
		() => true,
		() => false,
		subSlot(slot, 'hydrated'),
	);
}

export function ClientOnly(props) @{
	const hydrated = useHydrated();
	<>
		{hydrated ? props.children : props.fallback ?? null}
	</>
}
