# Skill-Pack Agent Generation Template

Use this prompt template with an AI model to generate or update a skill-pack agent file (for any library) that only routes an AI agent to the right `SKILL.md` index file(s).

Design goals:

- **Purpose-driven:** The agent file describes what this skill pack is for and when to use it.
- **Boundary-aware:** Be explicit about what this agent does NOT cover (e.g., no build/test/lint).
- **Navigation-focused:** Clear "If you need X, use Y" routing signals (derived from actual `SKILL.md` indexes).
- **Scannable:** Short sections, bullet points, no long prose essays.
- **Index-driven:** Routing signals come directly from the skill pack's `SKILL.md` indexes (not hardcoded guesses).
- **Minimal:** Only routing logic; no installation, CLI flags, or package-level behavior.

---

## How to use

1. Read this entire document to understand the structure and goals.
2. Fill in all variables in the "Variables" section below.
3. Copy the full prompt under "Template Prompt" into your AI tool.
4. Tell the model it has filesystem read access for inspection.
5. Ask it to output ONLY the final agent markdown file contents (no analysis, no extra commentary).

---

## Variables

Replace the placeholders below before running the prompt:

- `{{LIBRARY_ID}}`: package/library id (string label)
- `{{PROJECT_NAME}}`: display name for the agent
- `{{SKILL_PACK_SLUG}}`: directory name of the skill pack
- `{{SKILL_PACK_REPO_ROOT}}`: repo path where skill packs live (fallback)
- `{{SKILL_PACK_DEFAULT_INSTALL_DIR}}`: default install dir for skills (repo-local)
- `{{SKILL_PACK_LEGACY_INSTALL_DIR}}`: legacy install dir for skills (optional)
- `{{AGENT_FILE_PATH}}`: output agent file path in this repo

Common skill discovery signals (used only for locating skill files):

- A dependency install containing a `SKILL.md` root for this skill pack.
- A repo-local `.agents/skills` directory.
- A global `.agents/skills` directory.
- A fallback path inside the skill-pack repository itself.

---

## Template Prompt

```md
You are generating (or updating) a single agent markdown file for a skill pack.

Primary objective

- Produce a correct, concise agent file whose ONLY job is to route an AI agent to the appropriate skill-pack `SKILL.md` index file(s) using the indexes themselves.
- Make it scannable and immediately useful: an agent should understand in 30 seconds what this pack covers and when to use it.

Output constraints

- Output ONLY the final agent markdown file contents (single markdown file).
- Do not include analysis, commentary, or extra files.
- Keep it scannable: short sections, bullets, no essays or lengthy explanations.
- Explicitly define boundaries: "When NOT to use" is as important as "When to use."

Scope constraints (routing-only)

- Do NOT explain package/CLI behavior, installation steps, flags, or how skills get copied/registered.
- Do NOT add repo-level instructions (build/test/lint), project workflows, or "how to set up" guidance.
- Do NOT provide library usage advice here; only describe how to find the right skill-pack docs.

Skills-truth constraints

- Prefer facts derived from the skill pack indexes over guesses.
- Do not add repo-level build/test instructions; this is a library agent file, not a repository agent file.
- If a referenced path does not exist in the resolved skills root, do NOT reference it.

Library parameters

- library id: {{LIBRARY_ID}}
- agent name: {{PROJECT_NAME}}
- skills slug: {{SKILL_PACK_SLUG}}
- skills repo root: {{SKILL_PACK_REPO_ROOT}}
- repo-local skills dir: {{SKILL_PACK_DEFAULT_INSTALL_DIR}}
- legacy skills dir: {{SKILL_PACK_LEGACY_INSTALL_DIR}}
- agent file path: {{AGENT_FILE_PATH}}

Files to inspect (read-only)

1. Existing agent file (if present): `{{AGENT_FILE_PATH}}`
2. Skill pack indexes:
   - `{{SKILL_PACK_REPO_ROOT}}/{{SKILL_PACK_SLUG}}/SKILL.md`
   - Any additional `SKILL.md` files referenced from the root index (sub-areas/topics)

Required sections in the generated agent file

1. **What this agent is for** (1 paragraph max): Brief description of the skill pack and what questions it can help answer.
2. **When to use** (bullets): Common scenarios or keywords that signal "use this agent."
3. **When NOT to use** (bullets): Explicit boundaries (e.g., "This is not for X" or "Use a different agent if you need Y").
4. **Operating rules** (bullets): Key principles for using this agent (e.g., prefer indexes, don't invent topics, route to specifics).
5. **Skills routing** (critical section):
   - Entry point: `{{SKILL_PACK_SLUG}}/SKILL.md`
   - Sub-area decision signals (from actual `SKILL.md` indexes)
   - Skill location resolution (generic, defensive process)
   - Sub-routing: Use only the `SKILL.md` indexes to decide where to go next
6. **Do / Don't** (explicit rules block)
7. **Routing algorithm** (short, numbered steps)
8. **Examples** (4–6 real scenarios derived from the indexes)

Skill location resolution (for locating skill files only)

Describe the resolution process generically and defensively:

1. Dependency-installed skills
   - If the project includes this skill pack as a dependency and it contains a root `SKILL.md`, treat that dependency location as authoritative.

2. Repo-local `.agents` directory
   - If a repo-local `.agents/skills` directory contains this skill pack (optionally via a registry file), use that.

3. Global `.agents` directory
   - If a global `$HOME/.agents/skills` directory contains this skill pack, use that.

4. Legacy or alternative configured directory (if defined)
   - Use only if present.

5. Repository fallback (development mode)
   - If generating inside the skill-pack repository and a local `SKILL.md` root exists under `{{SKILL_PACK_REPO_ROOT}}/{{SKILL_PACK_SLUG}}`, use that.

Do not assume exact folder structures beyond verifying that a root `SKILL.md` for this skill pack exists at the resolved location.

Do / Don't (required)

Add an explicit block in the agent file with:

Do:
- Resolve the skills root by checking dependency installation first, then repo-local `.agents`, then global `.agents`, then fallback locations.
- Route into the correct sub-area/topic using only `{{SKILL_PACK_SLUG}}/SKILL.md` and any indexes it references.
- Output the next `SKILL.md` index file path(s) to consult (relative to the resolved skills root).

Don't:
- Mention installer/CLI behavior, flags, or registration.
- Invent topics that are not present in the SKILL indexes.
- Provide build/test/lint instructions.
- Hardcode internal directory structures that are not confirmed by the filesystem.

Routing algorithm (required)

Include a short, explicit algorithm in the agent file:

1. Discover a valid skills root:
   - Look for a dependency-installed location containing a root `SKILL.md` for this skill pack.
   - Else look in repo-local `.agents/skills`.
   - Else look in global `$HOME/.agents/skills`.
   - Else use a repository fallback if available.
   - Confirm the presence of the root `SKILL.md` before selecting a location.

2. Read the root `SKILL.md` inside the resolved skills root.

3. Extract available sub-areas/topics strictly from that index.

4. Match the user’s request to one of the indexed sub-areas/topics using only signals present in the index.

5. If the selected sub-area/topic has its own `SKILL.md`, read it and repeat the narrowing process.

6. Stop when the most specific `SKILL.md` index is reached.

7. Return the resolved `SKILL.md` file path (relative to the skills root) as the next file to read.

Examples (required)

Include 4–6 short "input → route" examples.

Rules for examples:

- Examples must be derived from the actual `SKILL.md` indexes for this pack (not invented).
- Each example is a concrete phrase or keyword → the next `SKILL.md` file to read.
- Keep examples short and scannable (one line per example).
- Examples should cover the breadth of topics in the skill pack (diverse decision points).

Definition of done (required)

Before finalizing output, ensure:

- [ ] The agent file contains ONLY routing content: purpose + when-to-use + when-NOT-to-use + operating rules + routing algorithm + examples.
- [ ] The file is scannable: can an agent understand its scope in 30 seconds?
- [ ] Every referenced path exists in the resolved skills root.
- [ ] Sub-area and topic routing match the SKILL indexes exactly (no invented topics).
- [ ] "When NOT to use" section is present and explicit.
- [ ] Examples are derived from the actual indexes and cover diverse routing scenarios.
- [ ] No package/CLI behavior, no installation steps, no build/test guidance, no library usage advice.
- [ ] No hardcoded internal structure that is not validated by the indexes.
- [ ] Links and file paths are repo-relative (not absolute; not pointing to compiled paths).

Metadata block (optional)

If you include metadata, keep it provenance-only. Place at the very top as an HTML comment block:

<!--
AGENT_META:
  library: {{LIBRARY_ID}}
  agentName: {{PROJECT_NAME}}
  skillPackSlug: {{SKILL_PACK_SLUG}}
  skillPackRepoRoot: {{SKILL_PACK_REPO_ROOT}}
  generatedAt: <ISO timestamp>
-->

Update behavior when the agent file already exists

- Keep existing valid content and structure; change only what is outdated or missing.
- Ensure "Skills routing" exists and matches the SKILL indexes.
- Do not introduce new structural assumptions unless confirmed by the indexes.
