import type { BackFn } from '@tanstack/router-core'

export function getDefaultNavigationButtonProps(
  router: { back: BackFn },
  backTitle: string | undefined,
  visible: boolean,
) {
  return {
    text: backTitle ?? 'Back',
    'android.systemIcon': 'ic_menu_back',
    visibility: visible ? 'visible' : 'collapsed',
    onTap: () => {
      void router.back()
    },
  } as const
}
