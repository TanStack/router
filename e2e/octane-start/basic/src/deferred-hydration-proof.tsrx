import { useState } from 'octane';
import './deferred-hydration-proof.css';

const browserProof = globalThis as typeof globalThis & {
	__octaneStartDeferredHydrationModuleLoaded?: boolean;
};

if (typeof document !== 'undefined') {
	browserProof.__octaneStartDeferredHydrationModuleLoaded = true;
}

export function DeferredHydrationProof() @{
	const [clicks, setClicks] = useState(0);

	<button
		class="octane-start-deferred-hydration-proof"
		data-clicks={String(clicks)}
		data-testid="deferred-hydration-proof"
		type="button"
		onClick={() => setClicks((count) => count + 1)}
	>
		{'deferred hydration clicks ' + clicks}
	</button>
}
