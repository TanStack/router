export interface BuildVirtualText {
  /** A module's text as its transforms start: what `read` answers from then on. */
  loaded: (id: string, text: string) => void
  read: (id: string) => Promise<string | null>
  /** The ids whose text this build saw. */
  ids: () => Iterable<string>
}

/**
 * The raw text of virtual modules in one build. The bundler has no load
 * without the transforms: `this.load` settles once they are done, and a
 * compile among them may ask for this text, or for that of a module waiting on
 * this one's compile (virtual modules importing each other). So a read never
 * waits for `this.load`: it starts the load and is answered from the first
 * transform hook, which every module reaches once its plugin loaded it, and
 * `this.load` settling only says the module never got there (a failed load).
 *
 * @param load the bundler's `this.load`; its text is that of a module whose
 * transforms the bundler skipped.
 */
export function buildVirtualText(
  load: (id: string) => Promise<string | null>,
): BuildVirtualText {
  const texts = new Map<string, string>()
  const reads = new Map<
    string,
    { text: Promise<string | null>; answer: (text: string | null) => void }
  >()
  const answer = (id: string, text: string | null) => {
    reads.get(id)?.answer(text)
    reads.delete(id)
  }
  return {
    ids: () => texts.keys(),
    loaded(id, text) {
      texts.set(id, text)
      answer(id, text)
    },
    read(id) {
      const text = texts.get(id)
      if (text !== undefined) {
        return Promise.resolve(text)
      }
      const inFlight = reads.get(id)
      if (inFlight) {
        return inFlight.text
      }
      let resolve!: (text: string | null) => void
      const started = new Promise<string | null>((r) => {
        resolve = r
      })
      reads.set(id, { text: started, answer: resolve })
      load(id).then(
        (loaded) => answer(id, loaded),
        () => answer(id, null),
      )
      return started
    },
  }
}
