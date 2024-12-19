import gradient from 'gradient-string'

const LEFT_PADDING = 5

export const logo = () => {
  const logoText = `|▗▄▄▄▖▗▄▖ ▗▖  ▗▖ ▗▄▄▖▗▄▄▄▖▗▄▖  ▗▄▄▖▗▖ ▗▖
                      |  █ ▐▌ ▐▌▐▛▚▖▐▌▐▌     █ ▐▌ ▐▌▐▌   ▐▌▗▞▘
                      |  █ ▐▛▀▜▌▐▌ ▝▜▌ ▝▀▚▖  █ ▐▛▀▜▌▐▌   ▐▛▚▖
                      |  █ ▐▌ ▐▌▐▌  ▐▌▗▄▄▞▘  █ ▐▌ ▐▌▝▚▄▄▖▐▌ ▐▌
                      `

  const startText = `|         ▗▄▄▖▗▄▄▄▖▗▄▖ ▗▄▄▖▗▄▄▄▖
                       |        ▐▌     █ ▐▌ ▐▌▐▌ ▐▌ █
                       |         ▝▀▚▖  █ ▐▛▀▜▌▐▛▀▚▖ █
                       |        ▗▄▄▞▘  █ ▐▌ ▐▌▐▌ ▐▌ █
                       `

  const removeLeadngChars = (str: string) => {
    return str
      .split('\n')
      .map((line) => line.replace(/^\s*\|/, ''))
      .join('\n')
  }

  const padLeft = (str: string) => {
    return str
      .split('\n')
      .map((line) => ' '.repeat(LEFT_PADDING) + line)
      .join('\n')
  }

  // Create the gradients first
  const logoGradient = gradient(['#00bba6', '#8a5eec'])
  const startGradient = gradient(['#00bba6', '#00bba6'])

  // Then apply them to the processed text
  const logo = logoGradient.multiline(padLeft(removeLeadngChars(logoText)))
  const start = startGradient.multiline(padLeft(removeLeadngChars(startText)))

  console.log()
  console.log(logo)
  console.log(start)
  console.log()
}
