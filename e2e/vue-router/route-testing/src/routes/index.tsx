import { defineComponent } from 'vue'
import { Link, createFileRoute } from '@tanstack/vue-router'

const HomePage = defineComponent({
  setup() {
    return () => (
      <main>
        <h1>Home</h1>
        <Link to="/posts/$postId" params={{ postId: 'post-1' }}>
          First post
        </Link>
      </main>
    )
  },
})

export const Route = createFileRoute('/')({
  component: HomePage,
})
