import type { AnyRouter } from '@tanstack/router-core'

export function getDefaultNavigationButtonProps(
  router: AnyRouter,
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
