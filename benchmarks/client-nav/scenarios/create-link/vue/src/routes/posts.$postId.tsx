import * as Vue from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const PostPage = Vue.defineComponent({
  setup() {
    const params = Route.useParams()

    return () => <main>{`post ${params.value.postId}`}</main>
  },
})

export const Route = createFileRoute('/posts/$postId')({
  component: PostPage,
})
