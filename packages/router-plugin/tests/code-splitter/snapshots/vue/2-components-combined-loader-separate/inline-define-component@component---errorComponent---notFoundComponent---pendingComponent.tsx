import { defineComponent } from 'vue'
const SplitComponent = defineComponent({
  setup() {
    const label: string = 'Inline Vue component'
    return () => <div>{label}</div>
  },
})
export { SplitComponent as component }
