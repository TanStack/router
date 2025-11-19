self.$_TSR = {
  c() {
    document.querySelectorAll('.\\$tsr').forEach((o) => {
      o.remove()
    })
    if (this.hydrated && this.streamEnd) {
      delete self.$_TSR
      delete self.$R['tsr']
    }
  },
  p(script) {
    !this.initialized ? this.buffer.push(script) : script()
  },
  buffer: [],
}
