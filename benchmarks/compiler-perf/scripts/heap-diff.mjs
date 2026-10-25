#!/usr/bin/env node
// Diff of two V8 heap snapshots of the same process (the soak's snapshots
// after cycles A and B; node ids are stable within a process).
//
// Usage: node --max-old-space-size=16000 heap-diff.mjs <A.heapsnapshot> <B.heapsnapshot> [--md out.md] [--json out.json] [--top 25]
//
// Reports:
// - per constructor (node type + name): count and self size in A and B,
//   and the objects of B that did not exist in A ("new survivors": allocated
//   between the snapshots and still alive after GC);
// - attribution of the new survivors' self size to the owner of their
//   retaining path: B's shortest path from the GC roots (weak edges
//   ignored) is walked from the object towards the roots, and the first
//   function (or class instance whose constructor is a function) defined in
//   a known package decides (`packages/<name>` of this repository,
//   `node_modules/<name>`, Node internals); the path itself is kept for the
//   largest groups.

import fs from 'node:fs'
import { parseArgs } from 'node:util'

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    md: { type: 'string' },
    json: { type: 'string' },
    top: { type: 'string', default: '25' },
  },
})
const TOP = Number(opts.top)

function load(file) {
  const t0 = Date.now()
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'))
  const meta = snap.snapshot.meta
  const nf = meta.node_fields
  const ef = meta.edge_fields
  const s = {
    file,
    strings: snap.strings,
    nodes: snap.nodes,
    edges: snap.edges,
    nodeTypes: meta.node_types[0],
    edgeTypes: meta.edge_types[0],
    N: nf.length,
    E: ef.length,
    iType: nf.indexOf('type'),
    iName: nf.indexOf('name'),
    iId: nf.indexOf('id'),
    iSize: nf.indexOf('self_size'),
    iEdges: nf.indexOf('edge_count'),
    eType: ef.indexOf('type'),
    eName: ef.indexOf('name_or_index'),
    eTo: ef.indexOf('to_node'),
  }
  s.count = s.nodes.length / s.N
  // first edge index of every node
  s.firstEdge = new Uint32Array(s.count + 1)
  let e = 0
  for (let i = 0; i < s.count; i++) {
    s.firstEdge[i] = e
    e += s.nodes[i * s.N + s.iEdges] * s.E
  }
  s.firstEdge[s.count] = e
  s.loadMs = Date.now() - t0
  return s
}

const typeOf = (s, i) => s.nodeTypes[s.nodes[i * s.N + s.iType]]
const nameOf = (s, i) => s.strings[s.nodes[i * s.N + s.iName]]
const idOf = (s, i) => s.nodes[i * s.N + s.iId]
const sizeOf = (s, i) => s.nodes[i * s.N + s.iSize]

function* edgesOf(s, i) {
  for (let e = s.firstEdge[i]; e < s.firstEdge[i + 1]; e += s.E) {
    const type = s.edgeTypes[s.edges[e + s.eType]]
    const raw = s.edges[e + s.eName]
    const name = type === 'element' || type === 'hidden' ? raw : s.strings[raw]
    yield { type, name, to: s.edges[e + s.eTo] / s.N }
  }
}

function edgeTo(s, i, wanted) {
  for (const e of edgesOf(s, i)) {
    if (e.name === wanted) {
      return e.to
    }
  }
  return -1
}

const groupKey = (s, i) => {
  const type = typeOf(s, i)
  const name = nameOf(s, i)
  if (
    type === 'string' ||
    type === 'concatenated string' ||
    type === 'sliced string'
  ) {
    return `(string)`
  }
  if (type === 'number' || type === 'hidden' || type === 'code') {
    return `(${type}) ${name.slice(0, 60)}`
  }
  return `${type === 'object' ? '' : `(${type}) `}${name.slice(0, 80)}`
}

/** The script URL a closure's code comes from (closure → shared → script, named by its URL). */
function scriptOf(s, closure, cache) {
  if (cache.has(closure)) {
    return cache.get(closure)
  }
  let url = null
  const shared = edgeTo(s, closure, 'shared')
  if (shared >= 0) {
    const script = edgeTo(s, shared, 'script')
    if (script >= 0) {
      // a Script node is named by its URL
      url = nameOf(s, script) || null
    }
  }
  cache.set(closure, url)
  return url
}

/** Owner of a script URL: a package of this repository, an npm package, or Node. */
export function ownerOfUrl(url) {
  if (!url) {
    return null
  }
  const u = url.replace(/^file:\/\//, '')
  const pnpm =
    /node_modules\/\.pnpm\/[^/]+\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(u)
  if (pnpm) {
    return pnpm[1]
  }
  const nm = /node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(u)
  if (nm) {
    return nm[1]
  }
  const repo = /\/packages\/([^/]+)\//.exec(u)
  if (repo) {
    return `@tanstack/${repo[1]} (repo)`
  }
  if (/\/benchmarks\/compiler-perf\/scripts\//.test(u)) {
    return 'compiler-perf harness'
  }
  if (/\/benchmarks\/compiler-perf\/apps\//.test(u)) {
    return 'app (vite.config)'
  }
  if (u.startsWith('node:') || !u.includes('/')) {
    return 'node'
  }
  return u
}

/** The function a node is attributed to: a closure itself, or the constructor of an object. */
function codeOwner(s, i, cache) {
  const type = typeOf(s, i)
  if (type === 'closure') {
    return ownerOfUrl(scriptOf(s, i, cache))
  }
  if (type === 'object') {
    // object → __proto__ → constructor (a closure for class instances)
    const proto = edgeTo(s, i, '__proto__')
    if (proto >= 0) {
      const ctor = edgeTo(s, proto, 'constructor')
      if (ctor >= 0 && typeOf(s, ctor) === 'closure') {
        const owner = ownerOfUrl(scriptOf(s, ctor, cache))
        // plain objects and builtins (Object, Map, Array) say nothing
        if (owner && owner !== 'node') {
          return owner
        }
      }
    }
  }
  return null
}

/** Shortest-path tree from the root (BFS over strong edges). */
function retainers(s) {
  const parent = new Int32Array(s.count).fill(-1)
  const via = new Int32Array(s.count).fill(-1)
  parent[0] = 0
  let queue = new Int32Array(s.count)
  let head = 0
  let tail = 0
  queue[tail++] = 0
  while (head < tail) {
    const i = queue[head++]
    // what only the snapshot's own call stack holds is no retention
    if (
      typeOf(s, i) === 'synthetic' &&
      /Stack roots|Handle scope/.test(nameOf(s, i))
    ) {
      continue
    }
    for (let e = s.firstEdge[i]; e < s.firstEdge[i + 1]; e += s.E) {
      const type = s.edgeTypes[s.edges[e + s.eType]]
      if (type === 'weak' || type === 'shortcut') {
        continue
      }
      const to = s.edges[e + s.eTo] / s.N
      if (parent[to] === -1) {
        parent[to] = i
        via[to] = e
        queue[tail++] = to
      }
    }
  }
  queue = null
  return { parent, via }
}

function edgeLabel(s, e) {
  const type = s.edgeTypes[s.edges[e + s.eType]]
  const raw = s.edges[e + s.eName]
  return type === 'element' || type === 'hidden'
    ? `[${raw}]`
    : type === 'internal' || type === 'context'
      ? `<${s.strings[raw]}>`
      : `.${s.strings[raw]}`
}

function pathOf(s, tree, i, max = 14) {
  const parts = []
  let cur = i
  while (cur !== 0 && tree.parent[cur] >= 0 && parts.length < max) {
    parts.push(`${groupKey(s, cur)}${edgeLabel(s, tree.via[cur])}`)
    cur = tree.parent[cur]
  }
  return parts.reverse().join(' ← ').slice(0, 1200)
}

/** Self size of every reachable object of a snapshot, by owner of its retaining path. */
function ownerTotals(s) {
  const tree = retainers(s)
  const scriptCache = new Map()
  const cache = new Map()
  const totals = new Map()
  const byGroup = new Map()
  for (let i = 1; i < s.count; i++) {
    if (tree.parent[i] === -1) {
      continue
    }
    const seen = []
    let cur = i
    let owner = null
    while (cur > 0) {
      if (cache.has(cur)) {
        owner = cache.get(cur)
        break
      }
      seen.push(cur)
      owner = codeOwner(s, cur, scriptCache)
      if (owner) {
        break
      }
      const p = tree.parent[cur]
      if (p < 0 || p === cur) {
        break
      }
      cur = p
    }
    owner ??= '(unattributed: root, system or builtins only)'
    for (const n of seen) {
      cache.set(n, owner)
    }
    totals.set(owner, (totals.get(owner) ?? 0) + sizeOf(s, i))
    let groups = byGroup.get(owner)
    if (!groups) {
      groups = new Map()
      byGroup.set(owner, groups)
    }
    const k = groupKey(s, i)
    const g = groups.get(k) ?? { count: 0, size: 0 }
    g.count++
    g.size += sizeOf(s, i)
    groups.set(k, g)
  }
  return { totals, byGroup }
}

export function diff(fileA, fileB) {
  const a = load(fileA)
  const byA = new Map()
  const idsA = new Set()
  let totalA = 0
  for (let i = 0; i < a.count; i++) {
    idsA.add(idOf(a, i))
    const k = groupKey(a, i)
    const g = byA.get(k) ?? { count: 0, size: 0 }
    g.count++
    g.size += sizeOf(a, i)
    totalA += sizeOf(a, i)
    byA.set(k, g)
  }
  const loadA = a.loadMs
  const { totals: ownersA, byGroup: groupsA } = ownerTotals(a)
  // free A before loading B
  a.nodes = a.edges = a.strings = null
  const b = load(fileB)
  const { byGroup: groupsB } = ownerTotals(b)
  const tree = retainers(b)
  const byB = new Map()
  const fresh = new Map()
  const owners = new Map()
  const ownersAll = new Map()
  const scriptCache = new Map()
  const ownerCache = new Map()
  let totalB = 0
  let freshTotal = 0
  let unreachable = 0
  const ownerOfNode = (i) => {
    // walk towards the root; the first node with a code owner decides
    const seen = []
    let cur = i
    let owner = null
    while (cur > 0) {
      if (ownerCache.has(cur)) {
        owner = ownerCache.get(cur)
        break
      }
      seen.push(cur)
      const o = codeOwner(b, cur, scriptCache)
      if (o) {
        owner = o
        break
      }
      const p = tree.parent[cur]
      if (p < 0 || p === cur) {
        break
      }
      cur = p
    }
    owner ??= '(unattributed: root, system or builtins only)'
    for (const n of seen) {
      ownerCache.set(n, owner)
    }
    return owner
  }
  for (let i = 0; i < b.count; i++) {
    const k = groupKey(b, i)
    const size = sizeOf(b, i)
    totalB += size
    const g = byB.get(k) ?? { count: 0, size: 0 }
    g.count++
    g.size += size
    byB.set(k, g)
    if (tree.parent[i] !== -1 && i > 0) {
      const owner = ownerOfNode(i)
      ownersAll.set(owner, (ownersAll.get(owner) ?? 0) + size)
    }
    if (!idsA.has(idOf(b, i))) {
      if (tree.parent[i] === -1) {
        unreachable += size
        continue
      }
      freshTotal += size
      const f = fresh.get(k) ?? { count: 0, size: 0, sample: i }
      f.count++
      f.size += size
      fresh.set(k, f)
      const owner = ownerOfNode(i)
      const o = owners.get(owner) ?? { count: 0, size: 0, groups: new Map() }
      o.count++
      o.size += size
      const og = o.groups.get(k) ?? { count: 0, size: 0, sample: i }
      og.count++
      og.size += size
      o.groups.set(k, og)
      owners.set(owner, o)
    }
  }
  const constructors = [...new Set([...byA.keys(), ...byB.keys()])]
    .map((k) => {
      const ga = byA.get(k) ?? { count: 0, size: 0 }
      const gb = byB.get(k) ?? { count: 0, size: 0 }
      return {
        group: k,
        countA: ga.count,
        countB: gb.count,
        sizeA: ga.size,
        sizeB: gb.size,
        dSize: gb.size - ga.size,
        dCount: gb.count - ga.count,
      }
    })
    .sort((x, y) => y.dSize - x.dSize)
  const freshGroups = [...fresh.entries()]
    .map(([group, f]) => ({
      group,
      count: f.count,
      size: f.size,
      path: pathOf(b, tree, f.sample),
    }))
    .sort((x, y) => y.size - x.size)
  const owned = [...owners.entries()]
    .map(([owner, o]) => ({
      owner,
      count: o.count,
      size: o.size,
      groups: [...o.groups.entries()]
        .map(([group, g]) => ({
          group,
          count: g.count,
          size: g.size,
          path: pathOf(b, tree, g.sample),
        }))
        .sort((x, y) => y.size - x.size)
        .slice(0, 6),
    }))
    .sort((x, y) => y.size - x.size)
  return {
    a: fileA,
    b: fileB,
    loadMs: [loadA, b.loadMs],
    totalA,
    totalB,
    freshTotal,
    unreachableFresh: unreachable,
    constructors,
    freshGroups,
    owners: owned,
    retainedByOwnerB: [...ownersAll.entries()]
      .map(([owner, size]) => ({ owner, size }))
      .sort((x, y) => y.size - x.size),
    ownerDelta: [...new Set([...ownersA.keys(), ...ownersAll.keys()])]
      .map((owner) => ({
        owner,
        a: ownersA.get(owner) ?? 0,
        b: ownersAll.get(owner) ?? 0,
        delta: (ownersAll.get(owner) ?? 0) - (ownersA.get(owner) ?? 0),
      }))
      .sort((x, y) => y.delta - x.delta),
    ownerGroupDelta: [...new Set([...groupsA.keys(), ...groupsB.keys()])].map(
      (owner) => {
        const ga = groupsA.get(owner) ?? new Map()
        const gb = groupsB.get(owner) ?? new Map()
        return {
          owner,
          groups: [...new Set([...ga.keys(), ...gb.keys()])]
            .map((group) => ({
              group,
              countA: ga.get(group)?.count ?? 0,
              countB: gb.get(group)?.count ?? 0,
              delta: (gb.get(group)?.size ?? 0) - (ga.get(group)?.size ?? 0),
            }))
            .sort((x, y) => y.delta - x.delta)
            .slice(0, 8),
        }
      },
    ),
  }
}

const kb = (v) => (v / 1024).toFixed(1)

function markdown(r) {
  const out = []
  out.push(
    `Snapshots: \`${r.a.split('/').pop()}\` → \`${r.b.split('/').pop()}\`. Self size total ${kb(r.totalA)} → ${kb(r.totalB)} KB (Δ ${kb(r.totalB - r.totalA)} KB). Objects of B not in A and reachable (new survivors): ${kb(r.freshTotal)} KB.`,
    '',
    '**New survivors by owner of the retaining path** (first function or class instance on the shortest path towards the GC roots defined in a package):',
    '',
    '| owner | objects | KB | largest groups (count, KB) |',
    '|---|---:|---:|---|',
  )
  for (const o of r.owners.slice(0, TOP)) {
    out.push(
      `| ${o.owner} | ${o.count} | ${kb(o.size)} | ${o.groups
        .slice(0, 4)
        .map(
          (g) => `${g.group.replace(/\|/g, '\\|')} (${g.count}, ${kb(g.size)})`,
        )
        .join('; ')} |`,
    )
  }
  out.push(
    '',
    '**Retained self size by owner, A → B** (every reachable object, attributed as above; sorted by growth):',
    '',
    '| owner | KB in A | KB in B | Δ KB |',
    '|---|---:|---:|---:|',
    ...r.ownerDelta
      .slice(0, TOP)
      .map((o) => `| ${o.owner} | ${kb(o.a)} | ${kb(o.b)} | ${kb(o.delta)} |`),
  )
  out.push(
    '',
    '**Growth by owner and constructor** (owners with growth, largest constructor deltas; count A → B, Δ KB):',
    '',
    ...r.ownerDelta
      .filter((o) => o.delta > 1024)
      .slice(0, 12)
      .map((o) => {
        const g = r.ownerGroupDelta.find((x) => x.owner === o.owner)
        return `- ${o.owner} (+${kb(o.delta)} KB): ${g.groups
          .filter((x) => x.delta > 0)
          .slice(0, 6)
          .map((x) => `${x.group} ${x.countA}→${x.countB} +${kb(x.delta)}`)
          .join('; ')}`
      }),
  )
  out.push(
    '',
    '**All of B by owner** (same attribution, every reachable object; KB of self size):',
    '',
    r.retainedByOwnerB
      .slice(0, 15)
      .map((o) => `${o.owner} ${kb(o.size)}`)
      .join(' · '),
  )
  out.push(
    '',
    '**Constructors by self-size growth** (B − A):',
    '',
    '| group | count A → B | KB A → B | Δ KB |',
    '|---|---|---|---:|',
  )
  for (const c of r.constructors.slice(0, TOP)) {
    out.push(
      `| ${c.group.replace(/\|/g, '\\|')} | ${c.countA} → ${c.countB} | ${kb(c.sizeA)} → ${kb(c.sizeB)} | ${kb(c.dSize)} |`,
    )
  }
  out.push(
    '',
    '**Largest groups of new survivors, with a sample retaining path** (root first):',
    '',
  )
  for (const g of r.freshGroups.slice(0, 12)) {
    out.push(
      `- ${g.group} — ${g.count} objects, ${kb(g.size)} KB: \`${g.path.replace(/`/g, "'")}\``,
    )
  }
  return out.join('\n') + '\n'
}

if (positionals.length === 2) {
  const r = diff(positionals[0], positionals[1])
  const md = markdown(r)
  if (opts.md) {
    fs.writeFileSync(opts.md, md)
  } else {
    console.log(md)
  }
  if (opts.json) {
    fs.writeFileSync(
      opts.json,
      JSON.stringify(
        {
          ...r,
          constructors: r.constructors.slice(0, 200),
          freshGroups: r.freshGroups.slice(0, 200),
        },
        null,
        2,
      ),
    )
  }
}
