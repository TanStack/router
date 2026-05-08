import * as React from 'react'
import {
  Area,
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatBenchmarkNumber } from '~/benchmark'

type ChartPoint = {
  label: string
  pipeline: number
  revenue: number
  risk: number
  forecast: number
}

const chartCodeMarker = 'deferred-hydration-recharts-child'

function wave(index: number, span: number, amplitude: number, phase = 0) {
  return Math.sin((index / span) * Math.PI * 2 + phase) * amplitude
}

function makeChartData(points: number, focusedSeries: 'pipeline' | 'forecast') {
  return Array.from({ length: points }, (_, index): ChartPoint => {
    const seed = (index + 1) * 2654435761
    const noise = ((seed >>> 9) % 120) - 60
    const pipeline =
      420 + wave(index, 84, 130) + wave(index, 21, 44, 0.8) + noise * 0.42
    const forecast =
      390 + wave(index, 120, 150, 1.4) + wave(index, 29, 38, 0.2) - noise * 0.34
    const revenue =
      240 + wave(index, 64, 72, 0.6) + ((seed >>> 16) % 180) * 0.55
    const riskBase = focusedSeries === 'pipeline' ? pipeline : forecast

    return {
      label: String(index + 1),
      pipeline: Math.max(0, Math.round(pipeline)),
      forecast: Math.max(0, Math.round(forecast)),
      revenue: Math.max(0, Math.round(revenue)),
      risk: Math.max(0, Math.round(riskBase * 0.18 + ((seed >>> 23) % 80))),
    }
  })
}

export function BenchmarkChart(props: { points: number }) {
  const [focusedSeries, setFocusedSeries] = React.useState<
    'pipeline' | 'forecast'
  >('pipeline')
  const [clicks, setClicks] = React.useState(0)
  const data = React.useMemo(
    () => makeChartData(props.points, focusedSeries),
    [focusedSeries, props.points],
  )

  return (
    <div className="chart-widget" data-testid="chart-widget">
      <span className="visually-hidden">{chartCodeMarker}</span>
      <div className="chart-controls">
        <div>
          <strong>Regional revenue mix</strong>
          <span>
            {formatBenchmarkNumber(props.points)} points, focused on{' '}
            {focusedSeries}
          </span>
        </div>
        <button
          type="button"
          data-testid="chart-action"
          onClick={() => {
            setFocusedSeries((value) =>
              value === 'pipeline' ? 'forecast' : 'pipeline',
            )
            setClicks((value) => value + 1)
          }}
        >
          Toggle series <span data-testid="chart-click-count">{clicks}</span>
        </button>
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 18, right: 20, bottom: 8, left: 4 }}
          >
            <CartesianGrid stroke="#dfe5db" vertical={false} />
            <XAxis
              dataKey="label"
              minTickGap={34}
              tickLine={false}
              axisLine={{ stroke: '#aeb9ae' }}
            />
            <YAxis
              yAxisId="left"
              width={54}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              width={54}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              isAnimationActive={false}
              contentStyle={{
                borderColor: '#cdd8cd',
                borderRadius: 8,
                boxShadow: '0 12px 30px rgba(32, 39, 42, 0.12)',
              }}
            />
            <Legend verticalAlign="top" height={34} />
            <Area
              isAnimationActive={false}
              yAxisId="left"
              type="monotone"
              dataKey="revenue"
              name="Revenue"
              fill="#c8dfd2"
              stroke="#2f7c68"
              strokeWidth={2}
              fillOpacity={0.8}
            />
            <Bar
              isAnimationActive={false}
              yAxisId="right"
              dataKey="risk"
              name="Risk"
              fill="#d88945"
              opacity={0.5}
              barSize={6}
            />
            <Line
              isAnimationActive={false}
              yAxisId="left"
              type="monotone"
              dataKey={focusedSeries}
              name={focusedSeries === 'pipeline' ? 'Pipeline' : 'Forecast'}
              stroke={focusedSeries === 'pipeline' ? '#173f5f' : '#7a4ea3'}
              strokeWidth={2.4}
              dot={false}
            />
            <Brush
              dataKey="label"
              height={24}
              travellerWidth={8}
              stroke="#879989"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
