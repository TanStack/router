# Route generator

- Preserve the existing `safeFileWrite` path: temporary-file rename, modification-time conflict retry, and post-rename stat. Keep unchanged-write suppression and main/shadow cache rotation; these protect concurrent edits, avoid watcher loops, and discard deleted routes.
- Run the complete `test:unit` and `test:integration` targets after generator changes. The fixtures run in copies (no test writes into this package); `test:integration` type-checks the route trees generated there (`tests/integration/fixture-types-*.test.ts`); `test:types` excludes the generator fixtures.
- Add generation cases under `tests/generator/<case>/`. Read [`tests/generator.test.ts`](tests/generator.test.ts) for per-case configuration and preprocessing. Change route inputs/configuration or templates; the test harness generates the route trees (no expected snapshots: the tests read the generated tree through a real router, the type checker and the text the documented output options control).
- `preprocess()` recreates selected route files for `file-modification*` and `custom-scaffolding`. Edit their templates/configuration/preprocessing when changing those inputs; edits to recreated files are overwritten.
- To run one test file or `-t` filter quickly, the slow-tier load gate and the test budgets: [compiler-test-utils/AGENTS.md](../compiler-test-utils/AGENTS.md).
- The spec these tests cite (clause ids such as `J4.12`, `G3`, `§5.7`), the rulings and the known bugs: [compiler-test-utils/oracle/README.md](../compiler-test-utils/oracle/README.md).
