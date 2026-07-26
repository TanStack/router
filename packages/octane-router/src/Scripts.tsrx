import { createElement, useEffect, useState } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import { getAssetKey } from './assetKeys.ts';
import { useRouter } from './context.ts';
import { useScripts } from './scriptContentUtils.ts';

export function Scripts() @{
	const router = useRouter();
	const scripts = useScripts();
	const [hydrating, setHydrating] = useState(true);
	useEffect(() => {
		setHydrating(false);
	}, []);
	const renderScripts =
		!(isServer ?? router.isServer) && hydrating
			? [
				{
					tag: 'script',
					attrs: {
						nonce: router.options.ssr?.nonce,
						className: '$tsr',
						id: '$tsr-stream-barrier',
						suppressHydrationWarning: true,
					},
					children: '',
				},
				...scripts,
			]
			: scripts;
	<>
		{renderScripts.map((script, index) => {
			const assetKey = getAssetKey('body', script, index);
			return createElement('script', {
				...script.attrs,
				key: assetKey,
				'data-tsr-managed-key': assetKey,
				dangerouslySetInnerHTML: { __html: script.children ?? '' },
			});
		})}
	</>
}
