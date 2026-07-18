import { Await, createFileRoute } from '@tanstack/octane-router';

export const Route = createFileRoute('/deferred-error')({
	loader: () => ({
		value: new Promise((_resolve, reject) => {
			setTimeout(() => reject(new Error('deferred boom')), 50);
		}),
	}),
	component: DeferredErrorPage,
});

function DeferredErrorPage() @{
	const data = Route.useLoaderData();

	<section>
		<h1>{'Deferred rejection'}</h1>
		<Await promise={data.value} fallback={<p>{'Pending rejection'}</p>}>
			{(value) => <p>{String(value)}</p>}
		</Await>
	</section>
}
