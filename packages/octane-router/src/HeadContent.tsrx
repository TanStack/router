import { createElement, useEffect } from 'octane';
import { DEV_STYLES_ATTR } from '@tanstack/router-core';
import { Asset } from './Asset.tsrx';
import { getAssetKey } from './assetKeys.ts';
import { useTags } from './headContentUtils.ts';
import { useHydrated } from './ClientOnly.tsrx';

export function HeadContent(props) @{
	const tags = useTags(props.assetCrossOrigin);
	const hydrated = useHydrated();

	useEffect(() => {
		if (process.env.NODE_ENV === 'production' || !hydrated) {
			return;
		}
		document
			.querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
			.forEach((element) => element.remove());
	}, [hydrated]);

	const filteredTags =
		process.env.NODE_ENV !== 'production' && hydrated
			? tags.filter(
					(tag) => tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true,
				)
			: tags;
	<>
		{filteredTags.map((tag, index) =>
			createElement(Asset, {
				...tag,
				assetKey: getAssetKey('head', tag, index),
				target: 'head',
				key: getAssetKey('head', tag, index),
			}),
		)}
	</>
}
