import { Hydrate } from '@tanstack/react-start';
import { idle, interaction, visible } from '@tanstack/react-start/hydration';
const unused = 'remove me from virtual modules';
function Outer() {
  return <section>Outer</section>;
}
function NestedButton() {
  return <button>Nested</button>;
}
function Sibling() {
  return <aside>Sibling</aside>;
}
export function Page() {
  return <>
      <Hydrate when={visible()} splitId="hydrateWhenNested_27eaf98771">
        <Outer />
        <Hydrate when={interaction()} splitId="hydrateWhenNested_895e8f985c">
          <NestedButton />
        </Hydrate>
      </Hydrate>
      <Hydrate when={idle()} splitId="hydrateWhenNested_383a2d73fd">
        <Sibling />
      </Hydrate>
    </>;
}