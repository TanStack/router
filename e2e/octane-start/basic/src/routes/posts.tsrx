import { useState } from 'octane';
import { Link, Outlet, createFileRoute } from '@tanstack/octane-router';
import { fetchPosts } from '../utils/posts.ts';

export const Route = createFileRoute('/posts')({
	loader: async () => fetchPosts(),
	component: PostsLayout,
});

function PostsLayout() @{
	const posts = Route.useLoaderData();
	const [count, setCount] = useState(0);

	<section>
		<h1>{'Posts'}</h1>
		<button
			type="button"
			data-testid="posts-parent-counter"
			onClick={() => setCount((value) => value + 1)}
		>
			{'Parent count ' + count}
		</button>
		<ul>
			@for (const post of posts; key post.id) {
				<li>
					<Link to="/posts/$postId" params={{ postId: post.id }}>
						{post.title}
					</Link>
				</li>
			}
			<li>
				<Link to="/posts/$postId" params={{ postId: 'missing' }}>
					{'Missing post'}
				</Link>
			</li>
		</ul>
		<Outlet />
	</section>
}
