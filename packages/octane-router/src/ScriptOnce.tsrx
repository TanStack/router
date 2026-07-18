import { useEffect, useState } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import { useRouter } from './context.ts';

export function ScriptOnce(props) @{
	const router = useRouter();
	const server = isServer ?? router.isServer;
	const [hydrating, setHydrating] = useState(true);
	useEffect(() => {
		setHydrating(false);
	}, []);

	@if (server || hydrating) {
		<script
			nonce={router.options.ssr?.nonce}
			dangerouslySetInnerHTML={{
				__html: props.children,
			}}
		/>
	} @else {
		<></>
	}
}
