<script lang="ts">
export let error: any;
let show = process.env.NODE_ENV !== 'production'
</script>

<div class="container">
  <header>
    <strong>Something went wrong!</strong>
    <button
      on:click={() => show = !show}
    >
      {show ? 'Hide Error' : 'Show Error'}
    </button>
  </header>
  <div class="error-message" />
  {#if show}
      <pre
      >
        {#if error.message}
          <code>{error.message}</code>
        {/if}
      </pre>
  {/if}
</div>

<style>
.container {
 padding: '.5rem';
 max-width: '100%';
}

header {
 display: 'flex'; align-items: 'center'; gap: '.5rem';
}

strong {
  font-size: '1rem';
}

button {
  appearance: 'none';
  font-size: '.6em';
  border: '1px solid currentColor';
  padding: '.1rem .2rem';
  font-weight: 'bold';
  border-radius: '.25rem';
}

.error-message {
  height: '.25rem';
}

pre {
  font-size: '.7em';
  border: '1px solid red';
  border-radius: '.25rem';
  padding: '.3rem';
  color: 'red';
  overflow: 'auto';
}
</style>
