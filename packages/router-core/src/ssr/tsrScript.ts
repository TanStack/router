self.$_TSR = {
  h() {
    this.hydrated = true
    this.c()
  },
  e() {
    this.streamEnded = true
    this.c()
  },
  c() {
    if (this.hydrated && this.streamEnded) {
      const cleanup = () => {
        if (self.$_TSR?.hydrated && self.$_TSR?.streamEnded) {
          delete self.$_TSR
          delete self.$R['tsr']
        }
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanup, { once: true })
      } else {
        cleanup()
      }
    }
  },
  p(script) {
    !this.initialized ? this.buffer.push(script) : script()
  },
  buffer: [],
}
