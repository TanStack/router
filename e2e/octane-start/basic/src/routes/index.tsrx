import { useState } from 'octane';
import { createFileRoute } from '@tanstack/octane-router';

const loaderRuns = new Map<string, number>();
const loaderEnvironment = typeof document === 'undefined' ? 'server' : 'client';

function getHeading() {
	return 'Octane + TanStack Start';
}

export const Route = createFileRoute('/')({
	loader: ({ location }) => {
		const runs = (loaderRuns.get(location.href) ?? 0) + 1;
		loaderRuns.set(location.href, runs);

		return {
			date: new Date('2026-07-16T12:34:56.000Z'),
			map: new Map([
				['framework', 'octane'],
				['pipeline', 'start'],
			]),
			run: `${loaderEnvironment} ${runs}`,
		};
	},
	component: Home,
});

function Home() @{
	const data = Route.useLoaderData();
	const [count, setCount] = useState(0);

	<section>
		<h1 data-testid="home-heading">{getHeading()}</h1>
		<p data-testid="loader-run">{'loader ran on ' + data.run}</p>
		<p data-testid="date-value">{data.date.toISOString()}</p>
		<p data-testid="map-value">{data.map.get('framework') + ' ' + data.map.get('pipeline')}</p>
		<button data-testid="counter" type="button" onClick={() => setCount((value) => value + 1)}>
			{'count ' + count}
		</button>
	</section>
}
