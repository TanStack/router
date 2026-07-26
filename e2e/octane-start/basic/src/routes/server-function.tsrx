import { useState } from 'octane';
import { createFileRoute } from '@tanstack/octane-router';
import { createServerFn } from '@tanstack/octane-start';

const roundTripServerValue = createServerFn({ method: 'POST' })
	.validator((data: { timestamp: Date; labels: Map<string, string> }) => data)
	.handler(async ({ data }) => ({
		timestamp: new Date(data.timestamp.getTime() + 1000),
		labels: new Map([...data.labels, ['runtime', 'server']]),
	}));

export const Route = createFileRoute('/server-function')({
	component: ServerFunctionPage,
});

function ServerFunctionPage() @{
	const [result, setResult] = useState('idle');

	const callServer = async () => {
		const value = await roundTripServerValue({
			data: {
				timestamp: new Date('2026-07-17T12:00:00.000Z'),
				labels: new Map([['framework', 'octane']]),
			},
		});

		setResult(
			`${value.timestamp.toISOString()} ${value.labels.get('framework')} ${value.labels.get('runtime')}`,
		);
	};

	<section>
		<h1>{'Server function'}</h1>
		<button data-testid="call-server-function" type="button" onClick={callServer}>
			{'Call server'}
		</button>
		<p data-testid="server-function-result">{result}</p>
	</section>
}
