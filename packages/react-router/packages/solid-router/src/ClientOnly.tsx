import * as Solid from 'solid-js'
import { isServer } from 'solid-js/web'

export interface ClientOnlyProps {
  /**
   * The children to render if the JS is loaded.
   */
  children: Solid.JSX.Element
  /**
   * The fallback component to render if the JS is not yet loaded.
   */
  fallback?: Solid.JSX.Element
}

/**
 * Render the children only after the JS has loaded client-side. Use an optional
 * fallback component if the JS is not yet loaded.
 *
 * @example
 * Render a Chart component if JS loads, renders a simple FakeChart
 * component server-side or if there is no JS. The FakeChart can have only the
 * UI without the behavior or be a loading spinner or skeleton.
 *
 * ```tsx
 * return (
 *   <ClientOnly fallback={<FakeChart />}>
 *     <Chart />
 *   </ClientOnly>
 * )
 * ```
 */
export function ClientOnly(props: ClientOnlyProps) {
  return (
    <Solid.Show when={!isServer} fallback={props.fallback}>
      <>{props.children}</>
    </Solid.Show>
  )
}
