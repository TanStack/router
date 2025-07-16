import { types } from 'recast'

const b = types.builders

export function ensureStringArgument(
  callExpression: types.namedTypes.CallExpression,
  value: string,
  preferredQuote?: "'" | '"',
) {
  const argument = callExpression.arguments[0]
  if (!argument) {
    let stringLiteral: types.namedTypes.StringLiteral
    if (!preferredQuote) {
      stringLiteral = b.stringLiteral.from({ value })
    } else {
      stringLiteral = b.stringLiteral.from({
        value,
        extra: {
          rawValue: value,
          raw: `${preferredQuote}${value}${preferredQuote}`,
        },
      })
    }
    callExpression.arguments.push(stringLiteral)
    return true
  } else if (argument.type === 'StringLiteral') {
    if (argument.value !== value) {
      argument.value = value
      return true
    }
  } else if (argument.type === 'TemplateLiteral') {
    if (
      argument.quasis.length === 1 &&
      argument.quasis[0] &&
      argument.quasis[0].value.raw !== value
    ) {
      argument.quasis[0].value.raw = value
      return true
    }
  }
  return false
}
