import { createElement as h, Fragment } from 'preact'
import { useContext, useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks'

export function SafeFragment(props: any) {
  return <>{props.children}</>
}
