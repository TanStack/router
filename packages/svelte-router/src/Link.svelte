<script lang="ts">
import { useLinkProps } from './hooks'
export let props
  const {
  href,
  "on:click": handleClick,
    'on:focus': handleFocus,
    'on:mouseenter': handleEnter,
    'on:mouseleave': handleLeave,
    'on:touchstart': handleTouchStart,
  ...restProps} = useLinkProps(props)
</script>

<a
  {href}
  on:click={handleClick}
  on:mouseenter={handleEnter}
  on:mouseleave={handleEnter}
  on:touchstart={handleTouchStart}
  {...restProps}
>
  <slot/>
</a>
