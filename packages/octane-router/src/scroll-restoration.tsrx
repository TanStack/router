import { getScrollRestorationScriptForRouter } from '@tanstack/router-core/scroll-restoration-script';
import { useRouter } from './context.ts';
import { ScriptOnce } from './ScriptOnce.tsrx';

export function ScrollRestorationScript() @{
	const router = useRouter();
	const script = getScrollRestorationScriptForRouter(router);

	@if (script) {
		<ScriptOnce children={script} />
	} @else {
		<></>
	}
}
