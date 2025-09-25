import * as goober from 'goober'
import { createEffect, createSignal } from 'solid-js'
import { useTheme } from '@tanstack/devtools-ui'
import { tokens } from './tokens'

const stylesFactory = (theme: 'light' | 'dark') => {
  const { colors, font, size, alpha, border } = tokens
  const { fontFamily, size: fontSize } = font
  const css = goober.css
  const t = (light: string, dark: string) => (theme === 'light' ? light : dark)

  return {
    mainContainer: css`
      display: flex;
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: ${size[2]};
      padding-top: 0;
      margin-top: ${size[2]};
    `,
    dragHandle: css`
      width: 8px;
      background: ${t(colors.gray[300], colors.darkGray[600])};
      cursor: col-resize;
      position: relative;
      transition: all 0.2s ease;
      user-select: none;
      pointer-events: all;
      margin: 0 ${size[1]};
      border-radius: 2px;

      &:hover {
        background: ${t(colors.blue[600], colors.blue[500])};
        margin: 0 ${size[1]};
      }

      &.dragging {
        background: ${t(colors.blue[700], colors.blue[600])};
        margin: 0 ${size[1]};
      }

      &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 2px;
        height: 20px;
        background: ${t(colors.gray[400], colors.darkGray[400])};
        border-radius: 1px;
        pointer-events: none;
      }

      &:hover::after,
      &.dragging::after {
        background: ${t(colors.blue[500], colors.blue[300])};
      }
    `,
    leftPanel: css`
      background: ${t(colors.gray[100], colors.darkGray[800])};
      border-radius: ${border.radius.lg};
      border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      flex-shrink: 0;
    `,
    rightPanel: css`
      background: ${t(colors.gray[100], colors.darkGray[800])};
      border-radius: ${border.radius.lg};
      border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      flex: 1;
    `,
    panelHeader: css`
      font-size: ${fontSize.md};
      font-weight: ${font.weight.bold};
      color: ${t(colors.blue[700], colors.blue[400])};
      padding: ${size[2]};
      border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      background: ${t(colors.gray[100], colors.darkGray[800])};
      flex-shrink: 0;
    `,
    utilList: css`
      flex: 1;
      overflow-y: auto;
      padding: ${size[1]};
      min-height: 0;
    `,
    utilGroup: css`
      margin-bottom: ${size[2]};
    `,
    utilGroupHeader: css`
      font-size: ${fontSize.xs};
      font-weight: ${font.weight.semibold};
      color: ${t(colors.gray[600], colors.gray[400])};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: ${size[1]};
      padding: ${size[1]} ${size[2]};
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border-radius: ${border.radius.md};
    `,
    utilRow: css`
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: ${size[2]};
      margin-bottom: ${size[1]};
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border-radius: ${border.radius.md};
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid transparent;

      &:hover {
        background: ${t(colors.gray[300], colors.darkGray[600])};
        border-color: ${t(colors.gray[400], colors.darkGray[500])};
      }
    `,
    utilRowSelected: css`
      background: ${t(colors.blue[100], colors.blue[900] + alpha[20])};
      border-color: ${t(colors.blue[600], colors.blue[500])};
      box-shadow: 0 0 0 1px
        ${t(colors.blue[600] + alpha[30], colors.blue[500] + alpha[30])};
    `,
    utilKey: css`
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[900], colors.gray[100])};
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `,
    utilStatus: css`
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[600], colors.gray[400])};
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: ${size[1]} ${size[1]};
      background: ${t(colors.gray[300], colors.darkGray[600])};
      border-radius: ${border.radius.sm};
      margin-left: ${size[1]};
    `,
    stateDetails: css`
      flex: 1;
      overflow-y: auto;
      padding: ${size[2]};
      min-height: 0;
    `,
    stateHeader: css`
      margin-bottom: ${size[2]};
      padding-bottom: ${size[2]};
      border-bottom: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
    `,
    stateTitle: css`
      font-size: ${fontSize.md};
      font-weight: ${font.weight.bold};
      color: ${t(colors.blue[700], colors.blue[400])};
      margin-bottom: ${size[1]};
    `,
    stateKey: css`
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[600], colors.gray[400])};
      word-break: break-all;
    `,
    stateContent: css`
      background: ${t(colors.gray[100], colors.darkGray[700])};
      border-radius: ${border.radius.md};
      padding: ${size[2]};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
    `,
    detailsGrid: css`
      display: grid;
      grid-template-columns: 1fr;
      gap: ${size[2]};
      align-items: start;
    `,
    detailSection: css`
      background: ${t(colors.white, colors.darkGray[700])};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
      border-radius: ${border.radius.md};
      padding: ${size[2]};
    `,
    detailSectionHeader: css`
      font-size: ${fontSize.sm};
      font-weight: ${font.weight.bold};
      color: ${t(colors.gray[800], colors.gray[200])};
      margin-bottom: ${size[1]};
      text-transform: uppercase;
      letter-spacing: 0.04em;
    `,
    actionsRow: css`
      display: flex;
      flex-wrap: wrap;
      gap: ${size[2]};
    `,
    actionButton: css`
      display: inline-flex;
      align-items: center;
      gap: ${size[1]};
      padding: ${size[1]} ${size[2]};
      border-radius: ${border.radius.md};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[500])};
      background: ${t(colors.gray[200], colors.darkGray[600])};
      color: ${t(colors.gray[900], colors.gray[100])};
      font-size: ${fontSize.xs};
      cursor: pointer;
      user-select: none;
      transition:
        background 0.15s,
        border-color 0.15s;
      &:hover {
        background: ${t(colors.gray[300], colors.darkGray[500])};
        border-color: ${t(colors.gray[400], colors.darkGray[400])};
      }
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        &:hover {
          background: ${t(colors.gray[200], colors.darkGray[600])};
          border-color: ${t(colors.gray[300], colors.darkGray[500])};
        }
      }
    `,
    actionDotBlue: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.blue[400]};
    `,
    actionDotGreen: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.green[400]};
    `,
    actionDotRed: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.red[400]};
    `,
    actionDotYellow: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.yellow[400]};
    `,
    actionDotOrange: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.pink[400]};
    `,
    actionDotPurple: css`
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: ${colors.purple[400]};
    `,
    infoGrid: css`
      display: grid;
      grid-template-columns: auto 1fr;
      gap: ${size[1]};
      row-gap: ${size[1]};
      align-items: center;
    `,
    infoLabel: css`
      color: ${t(colors.gray[600], colors.gray[400])};
      font-size: ${fontSize.xs};
      text-transform: uppercase;
      letter-spacing: 0.05em;
    `,
    infoValueMono: css`
      font-family: ${fontFamily.mono};
      font-size: ${fontSize.xs};
      color: ${t(colors.gray[900], colors.gray[100])};
      word-break: break-all;
    `,
    noSelection: css`
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${t(colors.gray[500], colors.gray[500])};
      font-style: italic;
      text-align: center;
      padding: ${size[4]};
    `,
    // Keep existing styles for backward compatibility
    sectionContainer: css`
      display: flex;
      flex-wrap: wrap;
      gap: ${size[4]};
    `,
    section: css`
      background: ${t(colors.gray[100], colors.darkGray[800])};
      border-radius: ${border.radius.lg};
      box-shadow: ${tokens.shadow.md(
        t(colors.gray[400] + alpha[80], colors.black + alpha[80]),
      )};
      padding: ${size[4]};
      margin-bottom: ${size[4]};
      border: 1px solid ${t(colors.gray[200], colors.darkGray[700])};
      min-width: 0;
      max-width: 33%;
      max-height: fit-content;
    `,
    sectionHeader: css`
      font-size: ${fontSize.lg};
      font-weight: ${font.weight.bold};
      margin-bottom: ${size[2]};
      color: ${t(colors.blue[600], colors.blue[400])};
      letter-spacing: 0.01em;
      display: flex;
      align-items: center;
      gap: ${size[2]};
    `,
    sectionEmpty: css`
      color: ${t(colors.gray[500], colors.gray[500])};
      font-size: ${fontSize.sm};
      font-style: italic;
      margin: ${size[2]} 0;
    `,
    instanceList: css`
      display: flex;
      flex-direction: column;
      gap: ${size[2]};
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
    `,
    instanceCard: css`
      background: ${t(colors.gray[200], colors.darkGray[700])};
      border-radius: ${border.radius.md};
      padding: ${size[3]};
      border: 1px solid ${t(colors.gray[300], colors.darkGray[600])};
      font-size: ${fontSize.sm};
      color: ${t(colors.gray[900], colors.gray[100])};
      font-family: ${fontFamily.mono};
      overflow-x: auto;
      transition:
        box-shadow 0.3s,
        background 0.3s;
    `,
  }
}

export function useStyles() {
  const { theme } = useTheme()
  const [styles, setStyles] = createSignal(stylesFactory(theme()))
  createEffect(() => {
    setStyles(stylesFactory(theme()))
  })
  return styles
}
