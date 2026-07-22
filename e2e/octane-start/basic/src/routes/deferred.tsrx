import { Await, createFileRoute } from '@tanstack/octane-router';
import { createServerFn } from '@tanstack/octane-start';

const immediatePerson = createServerFn({ method: 'GET' })
	.validator((name: string) => name)
	.handler(async ({ data: name }: { data: string }) => ({
		name,
		kind: 'immediate',
	}));

const deferredPerson = createServerFn({ method: 'GET' })
	.validator((name: string) => name)
	.handler(async ({ data: name }: { data: string }) => {
		await new Promise((resolve) => setTimeout(resolve, 100));
		return { name, kind: 'deferred' };
	});

export const Route = createFileRoute('/deferred')({
	loader: async () => {
		return {
			person: await immediatePerson({ data: 'Octane' }),
			deferredPerson: deferredPerson({ data: 'TanStack' }),
			value: new Promise((resolve) => {
				setTimeout(() => {
					resolve({
						date: new Date('2026-07-16T22:00:00.000Z'),
						map: new Map([['state', 'streamed']]),
					});
				}, 750);
			}),
		};
	},
	component: DeferredPage,
});

function DeferredPage() @{
	const data = Route.useLoaderData();

	<section>
		<h1>{'Deferred loader data'}</h1>
		<p data-testid="regular-person">{data.person.name + ' ' + data.person.kind}</p>
		<Await promise={data.deferredPerson} fallback={<p>{'Loading person'}</p>}>
			{(person) => <p data-testid="deferred-person">
				{person.name + ' ' + person.kind}
			</p>}
		</Await>
		<Await promise={data.value} fallback={<p data-testid="deferred-pending">{'Pending'}</p>}>
			{(value) => <p data-testid="deferred-value">
				{value.date.toISOString() + ' ' + value.map.get('state')}
			</p>}
		</Await>
	</section>
}
