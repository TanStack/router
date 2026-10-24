import { writeFileSync } from 'node:fs'

export default class RequireTestsReporter {
  tests = []

  onTestEnd(test, result) {
    this.tests.push({
      title: test.titlePath().join(' > '),
      status: result.status,
      errors: result.errors,
    })
  }

  onEnd(result) {
    const passed =
      this.tests.length > 0 &&
      this.tests.every((test) => test.status === 'passed')
    writeFileSync(
      process.env.NATIVE_REPORT,
      JSON.stringify({ result, tests: this.tests }, null, 2) + '\n',
    )
    if (!passed) {
      console.error(
        'Native validation requires every selected test to execute and pass; skips fail validation.',
      )
      return { status: 'failed' }
    }
  }
}
