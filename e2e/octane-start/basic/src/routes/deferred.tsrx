import { Await, createFileRoute } from '@tanstack/octane-router';

export const Route = createFileRoute('/deferred')({
	loader: () => ({
		value: new Promise((resolve) => {
			setTimeout(() => {
				resolve({
					date: new Date('2026-07-16T22:00:00.000Z'),
					map: new Map([['state', 'streamed']]),
				});
			}, 750);
		}),
	}),
	component: DeferredPage,
});

function DeferredPage() @{
	const data = Route.useLoaderData();

	<section>
		<h1>{'Deferred loader data'}</h1>
		<Await promise={data.value} fallback={<p data-testid="deferred-pending">{'Pending'}</p>}>
			{(value) => <p data-testid="deferred-value">
				{value.date.toISOString() + ' ' + value.map.get('state')}
			</p>}
		</Await>
	</section>
}
