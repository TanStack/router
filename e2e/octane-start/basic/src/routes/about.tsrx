import { createFileRoute } from '@tanstack/octane-router';

export const Route = createFileRoute('/about')({
	component: About,
});

function About() @{
	<section>
		<h1 data-testid="about-heading">{'Client navigation works'}</h1>
	</section>
}
