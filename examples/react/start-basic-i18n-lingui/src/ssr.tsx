/// <reference types="vinxi/types/server" />
import { i18n } from "@lingui/core";
import {
  createStartHandler,
  defaultStreamHandler,
  defineEventHandler,
	getHeaders,
	getWebRequest,
	setHeader,
} from '@tanstack/react-start/server'
import { getRouterManifest } from '@tanstack/react-start/router-manifest'
import { parse, serialize } from "cookie-es";

import {
	defaultLocale,
	dynamicActivate,
	isLocaleValid,
} from "./modules/lingui/i18n";
import { createRouter } from './router'

function getLocaleFromRequest() {
	const request = getWebRequest();
	const headers = getHeaders();
	const cookie = parse(headers.cookie ?? "");

	if (request) {
		const url = new URL(request.url);
		const queryLocale = url.searchParams.get("locale") ?? "";

		if (isLocaleValid(queryLocale)) {
			setHeader(
				"Set-Cookie",
				serialize("locale", queryLocale, {
					maxAge: 30 * 24 * 60 * 60,
					path: "/",
				}),
			);

			return queryLocale;
		}
	}

	if (cookie.locale && isLocaleValid(cookie.locale)) {
		return cookie.locale;
	}

	setHeader(
		"Set-Cookie",
		serialize("locale", defaultLocale, {
			maxAge: 30 * 24 * 60 * 60,
			path: "/",
		}),
	);

	return defaultLocale;
}

async function setupLocaleFromRequest() {
	await dynamicActivate(getLocaleFromRequest());
}

export default defineEventHandler(async (event) => {
	await setupLocaleFromRequest();

	return createStartHandler({
		createRouter: () => {
			return createRouter({ i18n });
		},
		getRouterManifest,
	})(defaultStreamHandler)(event);
});
