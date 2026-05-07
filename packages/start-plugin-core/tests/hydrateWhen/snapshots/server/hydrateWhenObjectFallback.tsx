import { Hydrate } from '@tanstack/react-start';
import { idle, visible } from '@tanstack/react-start/hydration';
const spreadProps = {
  when: visible()
};
function Widget(props: {
  title: string;
}) {
  return <p>{props.title}</p>;
}
export function Page() {
  return <>
      <Hydrate when={visible()} splitId="hydrateWhenObjectFallback_02e12e6487">
        <Widget title="direct" />
      </Hydrate>
      <Hydrate {...{
      when: idle()
    }} splitId="hydrateWhenObjectFallback_bdf3670c0a">
        <Widget title="inline spread" />
      </Hydrate>
      <Hydrate {...spreadProps} splitId="hydrateWhenObjectFallback_ff2f1d1b76">
        <Widget title="bound spread" />
      </Hydrate>
    </>;
}