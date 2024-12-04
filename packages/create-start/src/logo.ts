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

  const logo = gradient(['#00bba6', '#8a5eec'], {
    // interpolation: 'hsv',
  }).multiline(padLeft(removeLeadngChars(logoText)))

  const start = gradient(['#00bba6', '#00bba6'], {
    // interpolation: 'hsv',
  }).multiline(padLeft(removeLeadngChars(startText)))

  console.log()
  console.log(logo)
  console.log(start)
  console.log()
}
