import { readFileSync } from 'node:fs'

const mean = (values) =>
  values.reduce((sum, value) => sum + value, 0) / values.length
let seed = 123456789
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed / 4294967296
}
for (const file of process.argv.slice(2)) {
  const data = JSON.parse(readFileSync(file, 'utf8'))
  console.log(file)
  for (const result of data.results) {
    for (const metric of ['wallUs', 'cpuUs']) {
      if (result.pairs[0].base.samples[0][metric] === undefined) {
        continue
      }
      const before = result.pairs.map((pair) =>
        mean(pair.base.samples.map((sample) => sample[metric])),
      )
      const after = result.pairs.map((pair) =>
        mean(pair.candidate.samples.map((sample) => sample[metric])),
      )
      const ratios = before.map((value, index) =>
        Math.log(after[index] / value),
      )
      // Resample independent pairs, not correlated within-process batches.
      const resamples = Array.from({ length: 10000 }, () => {
        const sampled = ratios.map(
          () => ratios[Math.floor(random() * ratios.length)],
        )
        return 100 * (1 - Math.exp(mean(sampled)))
      }).sort((a, b) => a - b)
      const sd = Math.sqrt(
        mean(before.map((value) => (value - mean(before)) ** 2)),
      )
      console.log(
        JSON.stringify({
          case: `${result.mode}/${result.depth}`,
          metric,
          pairs: ratios.length,
          baseMean: mean(before),
          candidateMean: mean(after),
          improvementPercent: 100 * (1 - Math.exp(mean(ratios))),
          bootstrap95: [resamples[250], resamples[9750]],
          baselineCoefficientOfVariation: sd / mean(before),
          pairImprovementRange: [
            Math.min(...ratios.map((value) => 100 * (1 - Math.exp(value)))),
            Math.max(...ratios.map((value) => 100 * (1 - Math.exp(value)))),
          ],
        }),
      )
    }
  }
}
