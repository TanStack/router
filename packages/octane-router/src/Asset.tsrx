import { useLayoutEffect } from 'octane';
import { isServer } from '@tanstack/router-core/isServer';
import { useRouter } from './context.ts';
import { useHydrated } from './ClientOnly.tsrx';

const MANAGED_KEY_ATTR = 'data-tsr-managed-key';

function attributeName(name) {
	switch (name) {
		case 'charSet':
			return 'charset';
		case 'className':
			return 'class';
		case 'crossOrigin':
			return 'crossorigin';
		case 'httpEquiv':
			return 'http-equiv';
		default:
			return name;
	}
}

function setAttributes(element, attrs) {
	if (!attrs) {
		return;
	}
	for (const [name, value] of Object.entries(attrs)) {
		if (
			name === 'suppressHydrationWarning' ||
			value === undefined ||
			value === null ||
			value === false
		) {
			continue;
		}
		element.setAttribute(attributeName(name), value === true ? '' : String(value));
	}
}

function findManagedElement(parent, key) {
	for (const element of parent.querySelectorAll(`[${MANAGED_KEY_ATTR}]`)) {
		if (element.getAttribute(MANAGED_KEY_ATTR) === key) {
			return element;
		}
	}
	return undefined;
}

function mountAsset(props) {
	const parent = props.target === 'head' ? document.head : document.body;
	const existing = findManagedElement(parent, props.assetKey);
	if (existing) {
		return () => existing.remove();
	}

	const element = document.createElement(props.tag);
	element.setAttribute(MANAGED_KEY_ATTR, props.assetKey);
	setAttributes(element, props.attrs);
	if (typeof props.children === 'string') {
		element.textContent = props.children;
	}
	parent.appendChild(element);
	return () => element.remove();
}

export function Asset(props) @{
	const router = useRouter();
	const server = isServer ?? router.isServer;
	const hydrated = useHydrated();
	const renderElement = server || props.target === 'body' && !hydrated;

	if (!server) {
		useLayoutEffect(() => mountAsset(props), [
			props.assetKey,
			props.attrs,
			props.children,
			props.tag,
			props.target,
		]);
	}

	@if (renderElement) {
		@switch (props.tag) {
			@case 'title': {
				<title {...props.attrs} data-tsr-managed-key={props.assetKey}>
					{(props.children ?? '') as string}
				</title>
			}
			@case 'meta': {
				<meta {...props.attrs} data-tsr-managed-key={props.assetKey} />
			}
			@case 'link': {
				<link {...props.attrs} data-tsr-managed-key={props.assetKey} />
			}
			@case 'style': {
				<style
					{...props.attrs}
					data-tsr-managed-key={props.assetKey}
					dangerouslySetInnerHTML={{ __html: props.children ?? '' }}
				/>
			}
			@case 'script': {
				<script
					{...props.attrs}
					data-tsr-managed-key={props.assetKey}
					dangerouslySetInnerHTML={{ __html: props.children ?? '' }}
				/>
			}
			@default: {
				<></>
			}
		}
	} @else {
		<></>
	}
}
