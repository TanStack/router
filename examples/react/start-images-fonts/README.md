# Responsive images and local fonts

This Start example generates three WebP sizes before Vite runs, serves them through `srcSet`, and loads one Latin variable font from the same origin. It needs no image-service account or runtime transformation server.

From the repository root, install with `pnpm install`, then:

```sh
cd examples/react/start-images-fonts
pnpm dev
```

Open http://127.0.0.1:3130. For a production build:

```sh
pnpm build
PORT=3130 pnpm start
```

The Nitro output needs a compatible Node host. Deploy the complete output, including public assets. Sharp runs only during development setup and builds; it is not imported into the application. A build machine needs Sharp's supported native binaries. The Vite configuration disables asset inlining so even the smallest candidate is a separately cached file. Vite fingerprints generated images and the font, so changing their content changes their public URLs. Configure your host's cache policy for those fingerprinted assets.

`artwork/coast.svg` is an original illustration included under this repository's MIT license. It is a small deterministic input for the image pipeline, not a photographic compression benchmark. The Inter font package carries its own SIL Open Font License. Preserve that license when redistributing its font files.

The image is capped at 960 CSS pixels. `sizes` describes that layout, and the browser chooses among 480, 960, and 1600 pixel files. The largest source caps high-density output at 1600 pixels deliberately. Increase the source size and candidates if your design requires more detail. The eager hero has explicit dimensions and high fetch priority. Images below the fold should normally use `loading="lazy"` and omit high priority.

The font uses `font-display: optional`, which lets a slow first visit keep the system font instead of swapping late. This trades consistent first-visit typography for stability. The exact same font URL is used in CSS and the preload. Only normal Latin text is covered; add licensed subsets and italic faces if your content needs them.

## Verify

```sh
pnpm test:e2e
pnpm build
IMAGES_PRODUCTION=1 pnpm test:e2e
```

Tests check mobile and desktop source selection at two pixel densities, reserved image space when downloads fail, visible fallback text, and one same-origin font request. Use fresh browser contexts when testing responsive selection, because a browser may reuse a larger image already in its cache. These checks are local examples, not field Core Web Vitals measurements.

See the [Images and Fonts guide](https://tanstack.com/start/latest/docs/framework/react/guide/images-and-fonts) for image-service configuration and migration choices.
