<script lang="ts">
import { defineComponent, h } from 'vue'
import { Outlet } from '@tanstack/vue-router'

export default defineComponent({
  components: { Outlet },
  setup() {
    return () => h('div', { class: 'p-2' }, [
      h('div', { class: 'border-b' }, "I'm a layout"),
      h('div', {}, [h(Outlet)])
    ])
  }
})
</script>
