import { describe, expect, test, vi } from 'vitest'
import { getDefaultNavigationButtonProps } from '../src/action-bar'

describe('NativeScript action bar', () => {
  test('uses an accessible Android system back button', () => {
    const back = vi.fn().mockResolvedValue(undefined)
    const props = getDefaultNavigationButtonProps({ back }, undefined, true)

    expect(props).toMatchObject({
      text: 'Back',
      'android.systemIcon': 'ic_menu_back',
      visibility: 'visible',
    })

    props.onTap()
    expect(back).toHaveBeenCalledOnce()
  })

  test('preserves an explicit back title and collapsed state', () => {
    const props = getDefaultNavigationButtonProps(
      { back: vi.fn() },
      'Accounts',
      false,
    )

    expect(props.text).toBe('Accounts')
    expect(props.visibility).toBe('collapsed')
  })
})
