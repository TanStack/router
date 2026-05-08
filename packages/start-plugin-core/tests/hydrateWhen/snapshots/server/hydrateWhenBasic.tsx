import { Hydrate } from '@tanstack/react-start';
import { visible } from '@tanstack/react-start/hydration';
import { Chart } from './widgets';
import { formatValue } from './format';
const chartTitle = formatValue('Revenue');
export function Page() {
  return <section>
      <Hydrate when={visible({
      rootMargin: '200px',
      threshold: 0.25
    })} h="0_3cf0187f82">
        <Chart title={chartTitle} />
      </Hydrate>
    </section>;
}