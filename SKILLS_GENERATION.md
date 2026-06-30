# GENERATION.md — TanStack Router Skills Generation

> **Purpose**  
> This file defines how to _generate and update skill files only_ for **TanStack Router**.
>
> It does **not** describe packaging, publishing, installation, or distribution.
> Those concerns are intentionally out of scope.

This file exists solely to guide **skill content generation and maintenance** for TanStack Router–related skills.

---

## Library metadata

- **Library name:** TanStack Router
- **Skills scope directory:** `tanstack-router`
- **Primary domains (top-level splits):**
  - `router` — client-side routing concepts and APIs
  - `start` — full-stack / server-side concepts via TanStack Start

---

## What “skills” mean in this repo

Skills in this repo describe:

- how TanStack Router behaves
- how its APIs are structured
- what constraints apply in different environments
- how to choose between related APIs or patterns

They are designed to be:

- **machine-routable** (via SKILL indexes)
- **incrementally maintainable**
- **stable across Router versions**

Generation MUST:

- update only files affected by Router changes
- preserve existing wording where still correct
- avoid rewriting unrelated files

---

## Canonical skill structure

```
    <skills-root>/
      tanstack-router/
        SKILL.md                 # pack-level index (Router vs Start)
        router/
          SKILL.md               # Router domain index
          <topic>/
            SKILL.md
            references/
              *.md
        start/
          SKILL.md               # Start domain index
          <topic>/
            SKILL.md
            references/
              *.md
```

Rules:

- Every directory **must** have a `SKILL.md`
- Every reference file must be reachable through an index
- No orphaned files are allowed

---

## Authoring intent

These skills are **not tutorials** and **not onboarding docs**.

Optimize for:

- routing user intent quickly (Router vs Start, then topic)
- precise answers to narrow questions
- minimal verbosity
- correctness over explanation

Assume:

- the user already understands what routing is
- the AI is helping solve a concrete problem (typing, SSR, navigation, data loading, etc.)

---

## File roles

### `SKILL.md` (index + routing)

Used to:

- define scope boundaries
- route user intent downward
- prevent over-broad answers

Each `SKILL.md` must:

- state what belongs in this layer
- explicitly route to subtopics
- provide intent-detection signals

### `references/*.md` (atomic knowledge)

Used for:

- individual Router or Start concepts
- specific APIs (`useNavigate`, route trees, loaders, etc.)
- constraints (SSR, serialization, runtime boundaries)

Each reference should answer **one Router-specific question** well.

---

## Required `SKILL.md` template (Router)

```
    ---
    name: <stable-skill-identifier>
    description: |
      <2–3 lines describing Router-specific scope and intent>
    ---

    # <Title>

    <1–3 sentence scope explanation>

    ## Routing Table

    | Topic | Directory | When to Use |
    | --- | --- | --- |
    | **<Topic Name>** | `<dir>/` | <router-specific intent signals> |

    ## Quick Detection

    **Route here when:**
    - <router-specific signal>
    - <router-specific signal>
```

Notes:

- `name` values should remain stable across Router versions
- routing tables must match actual directories

---

## Reference file guidelines (Router-specific)

Each `references/*.md` file should include:

- **What this API or concept is**
- **When to use it**
- **When not to**
- **Key Router APIs**
- **Runtime constraints** (client vs server, SSR, streaming, etc.)
- **Minimal, correct examples**
- **Common Router-specific pitfalls**

Avoid:

- re-explaining routing fundamentals
- long walkthroughs
- framework marketing language

If a reference becomes large:

- split by concern (typing vs runtime, config vs usage)
- link between references instead of duplicating text

---

## Domain splitting rules (Router vs Start)

Use the following rules to decide placement:

### Route to `router/` when:

- the topic is client-side routing
- it involves route definitions, navigation, params, search params
- it concerns loaders, route trees, or code splitting
- it applies regardless of server runtime

### Route to `start/` when:

- the topic involves server functions
- it concerns SSR, streaming, or deployment
- it relies on runtime boundaries (Node, edge, etc.)
- it uses Start-only APIs

If a topic spans both:

- create parallel references where behavior differs, or
- place shared concepts higher and link down

---

## Generation & update rules (CRITICAL)

When generating or updating Router skills:

1. **Detect Router changes**

- new APIs
- behavior changes
- deprecations

2. **Edit minimally**

- preserve unchanged files verbatim
- do not reflow or restyle without cause

3. **Maintain routing**

- update parent `SKILL.md` when adding topics
- ensure no orphaned references exist

4. **Prefer patching**

- update existing files rather than regenerating them

5. **Respect hierarchy**

- do not introduce new domain levels unless Router architecture changes

---

## Converting Router docs → skills

Recommended process:

1. Identify the **Router-specific user intent**
2. Extract only:

- API names and signatures
- behavior constraints
- edge cases
- minimal examples

3. Rewrite into:

- short sections
- bullet lists
- compact code snippets

4. Place content into:

- an existing reference if it fits
- a new reference if not

5. Update routing tables if structure changes

Never:

- mirror Router docs verbatim
- include tutorials or onboarding flows
- include marketing copy

---

## Quality checklist (pre-merge)

- [ ] Every Router skill file is reachable from an index
- [ ] No duplicated Router concepts across references
- [ ] Examples reflect real Router usage
- [ ] Router vs Start boundaries are respected
- [ ] Routing tables match directory structure
- [ ] Unchanged files remain untouched
