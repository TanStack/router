import { createFileRoute } from '@tanstack/octane-router';
import { fetchPost } from '../utils/posts.ts';

export const Route = createFileRoute('/posts/$postId')({
	loader: async ({ params: { postId } }) => fetchPost({ data: postId }),
	component: Post,
	notFoundComponent: PostNotFound,
});

function Post() @{
	const post = Route.useLoaderData();

	<article data-testid="post-detail">
		<h2>{post.title}</h2>
		<p>{post.body}</p>
	</article>
}

function PostNotFound() @{
	<section data-testid="post-not-found">
		<h2>{'Post not found'}</h2>
	</section>
}
