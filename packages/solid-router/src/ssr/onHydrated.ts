/** @internal Solid's resource scripts can outlive Router's serialized data. */
export function onHydrated() {
  const finish = () => window.$_TSR?.h()
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', finish, { once: true })
  } else {
    finish()
  }
}
