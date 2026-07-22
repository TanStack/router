import { createFileRoute } from '@tanstack/octane-router';

export const Route = createFileRoute('/posts/')({
	component: PostsIndex,
});

function PostsIndex() @{
	<p data-testid="posts-index">{'Select a post'}</p>
}
