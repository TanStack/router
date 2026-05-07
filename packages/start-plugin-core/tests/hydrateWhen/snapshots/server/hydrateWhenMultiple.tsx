import { Hydrate } from '@tanstack/react-start';
import { load, media, visible } from '@tanstack/react-start/hydration';
function Summary() {
  return <section>Summary</section>;
}
function Comments() {
  return <section>Comments</section>;
}
function Footer() {
  return <footer>Footer</footer>;
}
export function Page() {
  return <>
      <Hydrate when={load()} splitId="hydrateWhenMultiple_60c0370186">
        <Summary />
      </Hydrate>
      <Hydrate when={visible()} splitId="hydrateWhenMultiple_b697cf73ee">
        <Comments />
      </Hydrate>
      <Hydrate when={media('(min-width: 800px)')} splitId="hydrateWhenMultiple_67a68576e2">
        <Footer />
      </Hydrate>
    </>;
}