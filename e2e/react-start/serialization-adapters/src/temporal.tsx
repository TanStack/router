export const temporalTypeNames = [
  'Instant',
  'Duration',
  'PlainDate',
  'PlainDateTime',
  'PlainMonthDay',
  'PlainTime',
  'PlainYearMonth',
  'ZonedDateTime',
] as const

export function makeTemporalData() {
  return {
    Instant: Temporal.Instant.from('2024-03-05T06:07:08.9Z'),
    Duration: Temporal.Duration.from('P1Y2M3DT4H5M6.7S'),
    PlainDate: Temporal.PlainDate.from('2024-03-05'),
    PlainDateTime: Temporal.PlainDateTime.from('2024-03-05T06:07:08.9'),
    PlainMonthDay: Temporal.PlainMonthDay.from('03-05'),
    PlainTime: Temporal.PlainTime.from('06:07:08.9'),
    PlainYearMonth: Temporal.PlainYearMonth.from('2024-03'),
    ZonedDateTime: Temporal.ZonedDateTime.from(
      '2024-03-05T06:07:08.9+01:00[Europe/Berlin]',
    ),
  }
}

export type TemporalData = ReturnType<typeof makeTemporalData>

function formatTemporal(value: unknown) {
  return `${Object.prototype.toString.call(value)} ${String(value)}`
}

export function RenderTemporalData({
  id,
  data,
}: {
  id: string
  data: TemporalData
}) {
  const localData = makeTemporalData()
  return (
    <div data-testid={`${id}-container`}>
      {temporalTypeNames.map((name) => (
        <div key={name}>
          <h4>{name}</h4>
          <div data-testid={`${id}-${name}-expected`}>
            {formatTemporal(localData[name])}
          </div>
          <div data-testid={`${id}-${name}-actual`}>
            {formatTemporal(data[name])}
          </div>
        </div>
      ))}
    </div>
  )
}
