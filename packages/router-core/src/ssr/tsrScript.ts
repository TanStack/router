self.$_TSR = {
  c() {
    // If Vue has set the defer flag, don't remove scripts yet - wait for Vue to call cleanup()
    if (self.$_TSR_DEFER) {
      return
    }
    document.querySelectorAll('.\\$tsr').forEach((o) => {
      o.remove()
    })
    if (this.hydrated && this.streamEnd) {
      delete self.$_TSR
      delete self.$R['tsr']
    }
  },
  // Called by Vue after hydration is complete to perform deferred cleanup
  cleanup() {
    document.querySelectorAll('.\\$tsr').forEach((o) => {
      o.remove()
    })
    if (this.hydrated && this.streamEnd) {
      delete self.$_TSR
      delete self.$_TSR_DEFER
      delete self.$R['tsr']
    }
  },
  p(script) {
    !this.initialized ? this.buffer.push(script) : script()
  },
  buffer: [],
}
