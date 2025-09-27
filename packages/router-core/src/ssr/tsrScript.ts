self.$_TSR = {
  c() {
    document.querySelectorAll('.\\$tsr').forEach((o) => {
      o.remove()
    })
  },
  p(script) {
    !this.initialized ? this.buffer.push(script) : script()
  },
  buffer: [],
}
