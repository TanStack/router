import chalk from 'chalk'
import { diffWords } from 'diff'

export function logDiff(oldStr: string, newStr: string) {
  const differences = diffWords(oldStr, newStr)

  let output = ''
  let unchangedLines = ''

  function processUnchangedLines(lines: string): string {
    const lineArray = lines.split('\n')
    if (lineArray.length > 4) {
      return [
        chalk.dim(lineArray[0]),
        chalk.dim(lineArray[1]),
        '',
        chalk.dim.bold(`... (${lineArray.length - 4} lines) ...`),
        '',
        chalk.dim(lineArray[lineArray.length - 2]),
        chalk.dim(lineArray[lineArray.length - 1]),
      ].join('\n')
    }
    return chalk.dim(lines)
  }

  differences.forEach((part, index) => {
    const nextPart = differences[index + 1]

    if (part.added) {
      if (unchangedLines) {
        output += processUnchangedLines(unchangedLines)
        unchangedLines = ''
      }
      output += chalk.green.bold(part.value)
      if (nextPart?.removed) output += ' '
    } else if (part.removed) {
      if (unchangedLines) {
        output += processUnchangedLines(unchangedLines)
        unchangedLines = ''
      }
      output += chalk.red.bold(part.value)
      if (nextPart?.added) output += ' '
    } else {
      unchangedLines += part.value
    }
  })

  // Process any remaining unchanged lines at the end
  if (unchangedLines) {
    output += processUnchangedLines(unchangedLines)
  }

  if (output) {
    console.log('\nDiff:')
    console.log(output + '\n')
  } else {
    console.log('No changes')
  }
}
