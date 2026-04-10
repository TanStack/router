import * as React from 'react'

export const importedComponent = (): React.JSX.Element => {
  return <div>I am imported</div>
}

export const importedErrorComponent = (): React.JSX.Element => {
  return <div>I am an error imported</div>
}

export const importedNotFoundComponent = (): React.JSX.Element => {
  return <div>I am a not found imported</div>
}

export const importedPendingComponent = (): React.JSX.Element => {
  return <div>I am a pending imported</div>
}

export const importedLoader = (): { randomNumber: number } => {
  return {
    randomNumber: Math.random(),
  }
}

export default function ImportedDefaultComponent(): React.JSX.Element {
  return <div>Default imported</div>
}
