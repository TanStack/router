import { tokenizer } from 'acorn'

/** Defer Solid's native serializer scripts using Router's adapter-ready queue. */
export function deferHydrationScripts(html: string) {
  // Solid emits its initial serializer script immediately before the hydration
  // marker (or appends it to the shell if no HydrationScript was rendered).
  // Later task records consist of one complete script; template records carry
  // only markup. Never search or rewrite arbitrary application script bodies.
  const taskRecord = html.startsWith('<script')
  const marker = taskRecord ? -1 : html.indexOf('<!--xs-->')
  const end = marker < 0 ? html.length : marker
  if (!html.endsWith('</script>', end)) {
    return html
  }
  const start = taskRecord ? 0 : html.lastIndexOf('<script', end)
  const body = html.indexOf('>', start) + 1
  let source = html.slice(body, end - 9)
  if (start < 0 || (!source.startsWith('self.$R=') && start !== 0)) {
    return html
  }

  // Native task records mix serialization with $df fragment swaps. Keep swaps
  // progressive even when application JavaScript (and its adapters) is delayed.
  // Tokenize real statements: serialized strings and RegExp literals can contain
  // text that looks exactly like a swap. Preserve Solid's code verbatim.
  let swaps = ''
  const lastSwap = source.lastIndexOf('$df')
  if (lastSwap >= 0) {
    let serialized = ''
    let position = 0
    let statementStart = -1
    let depth = 0
    let swap = false
    let declaration = false
    for (const token of tokenizer(source, { ecmaVersion: 'latest' })) {
      const label = token.type.label
      if (statementStart < 0) {
        statementStart = token.start
        swap =
          label === 'name' && source.slice(token.start, token.end) === '$df'
        declaration = label === 'function'
      } else if (declaration && !swap) {
        swap =
          label === 'name' && source.slice(token.start, token.end) === '$df'
        declaration = swap
      }
      if (label === '(' || label === '[' || label === '{' || label === '${') {
        depth++
      } else if (label === ')' || label === ']' || label === '}') {
        depth--
      }
      if (depth === 0 && (label === ';' || (declaration && label === '}'))) {
        if (swap) {
          swaps += source.slice(statementStart, token.end) + ';'
          serialized += source.slice(position, statementStart)
          position = token.end
        }
        statementStart = -1
        swap = false
        declaration = false
      }
      // Native swaps usually precede a large data expression. No later token
      // can introduce another swap once its last possible identifier is past.
      if (token.end > lastSwap && statementStart < 0) {
        break
      }
    }
    source = serialized + source.slice(position)
  }

  // Seroval emits expressions using global cross-references. With $df's global
  // declaration kept outside, they can run directly in Router's existing queue.
  return (
    html.slice(0, body) +
    swaps +
    `(self.$_TSR?.p??(f=>(self.$_TSR??={buffer:[]}).buffer.push(f))).call(self.$_TSR,()=>{${source}})` +
    html.slice(end - 9)
  )
}
