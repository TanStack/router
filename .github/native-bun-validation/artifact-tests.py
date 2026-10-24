import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET


root = Path(os.environ["GITHUB_WORKSPACE"])
binary = root / ".native-artifact/binary/bun"
proof = root / ".native-browser-proof"
proof.mkdir(exist_ok=True)
expected = json.loads((root / ".native-artifact/binary-proof.json").read_text())
manifest = json.loads((root / ".github/native-bun-validation/native-v15-manifest.json").read_text())
assert hashlib.sha256(binary.read_bytes()).hexdigest() == expected["sha256"]
assert expected["base"] == manifest["head"]
assert expected["patchSha256"] == manifest["trackedPatchSha256"]
assert expected["additionalFiles"] == manifest["additionalFiles"]
binary.chmod(0o755)
source = root / ".cache/native-bun-validation/test-source"
subprocess.run([
    "python3", str(root / ".github/native-bun-validation/prepare.py"),
    "--bun", str(source), "--out", str(proof / "native-source"),
], check=True)
overrides = proof / "native-test-overrides"
overrides.mkdir(exist_ok=True)
adjusted_sources = {}
patches = {}
for name, digest, allowed_paths in [
    ("mac-quiet-watch-tests.patch",
     "65c3d33ff88d44e9748498ad7a34bb3113be8fdd940a39aaad4de4b98b2aa062",
     {"test/bake/dev/plugins.test.ts", "test/bake/dev/client-plugin-cache.test.ts"}),
    ("hmr-script-order-test.patch.gz",
     "2d550b1127c34240788bf4a5ce5a5ca69c76ff0f83aca675373d2d2d04c854bc",
     {"test/js/bun/webview/webview-chrome.test.ts"}),
    ("input-map-sync-test.patch.gz",
     "a9a19adad05b39a99efbe48d80cf06334cd0d53e93aa58a2f2cfb02bd7e5f487",
     {"test/bundler/bun-build-api.test.ts"}),
]:
    patch = (root / ".github/native-bun-validation" / name).read_bytes()
    if name.endswith(".gz"):
        patch = gzip.decompress(patch)
    assert hashlib.sha256(patch).hexdigest() == digest
    paths = re.findall(rb"^diff --git a/(\S+) b/(\S+)$", patch, re.MULTILINE)
    assert all(old == new for old, new in paths)
    assert {old.decode() for old, _ in paths} == allowed_paths
    subprocess.run(["git", "apply", "--check", "-"], cwd=source, input=patch, check=True)
    subprocess.run(["git", "apply", "-"], cwd=source, input=patch, check=True)
    (overrides / name.removesuffix(".gz")).write_bytes(patch)
    patches[name] = digest
    for old, _ in paths:
        filename = old.decode()
        contents = (source / filename).read_bytes()
        adjusted_sources[filename] = hashlib.sha256(contents).hexdigest()
        target = overrides / filename
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(contents)
(overrides / "proof.json").write_text(json.dumps({
    "binaryRuntimeUnchanged": True,
    "testOnlyPatchSha256": patches,
    "adjustedSourceSha256": adjusted_sources,
}, indent=2) + "\n")
for cwd in [source, source / "test"]:
    subprocess.run([str(binary), "install", "--frozen-lockfile"], cwd=cwd, check=True)
tests = manifest["testCommand"].split(" test ", 1)[1].split()
assert len(tests) == 9
isolated = [
    ("test/bake/dev/plugins.test.ts", "watchDirs preserves browser state when only a child file's contents change"),
    ("test/bake/dev/plugins.test.ts", "watchDirs shares directory events with imported files and trailing-slash aliases"),
    ("test/bake/dev/client-plugin-cache.test.ts", "client plugin cache probe: structural dependency update serves the current manifest"),
    ("test/bake/dev/server-sourcemap.test.ts", "server-side source maps handle nested imports"),
    ("test/bake/dev/hot.test.ts", "retains separate watcher batches while the server thread is busy"),
    ("test/bake/dev/hot.test.ts", "retains separate watcher batches while the server thread is busy with an atomic plugin dependency"),
    ("test/bake/dev/hot.test.ts", "evaluates an accepting importer after all changed dependencies"),
    ("test/bake/dev/hot.test.ts", "evaluates an accepting importer after all changed dependencies and disposes it once"),
    ("test/bake/dev/hot.test.ts", "evaluates an accepting importer after all changed dependencies with an async dependency"),
    ("test/bake/dev/hot.test.ts", "evaluates an accepting importer after all changed dependencies and disposes it once with an async dependency"),
    ("test/bundler/bun-build-api.test.ts", "an external input source map is read synchronously"),
    ("test/bundler/bun-build-api.test.ts", "an input source map named by a file: URL is composed"),
]
isolated_results = []
for index, (filename, title) in enumerate(isolated):
    isolated_report = proof / f"native-isolated-{index}.xml"
    run = subprocess.run([
        str(binary), "test", filename, "-t", re.escape(title) + "$",
        "--reporter=junit", f"--reporter-outfile={isolated_report}",
    ], cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env={
        **os.environ,
        "BUN_DEV_SERVER_VERBOSE_SYNC": "1",
        "BUN_WATCHER_TRACE": str(proof / f"native-isolated-{index}-watcher.jsonl"),
    })
    (proof / f"native-isolated-{index}.log").write_text(run.stdout)
    all_cases = ET.parse(isolated_report).findall(".//testcase") if isolated_report.exists() else []
    selected = [case for case in all_cases if case.attrib.get("name", "").endswith(title)]
    passed = run.returncode == 0 and len(selected) == 1 and all(
        not any(case.find(tag) is not None for tag in ["failure", "error", "skipped"])
        for case in selected
    ) and all(case.find("skipped") is not None for case in all_cases if case not in selected)
    isolated_results.append({"file": filename, "title": title, "passed": passed,
                             "cases": len(selected), "filteredOut": len(all_cases) - len(selected)})
    print(json.dumps(isolated_results[-1]))
(proof / "native-isolated-results.json").write_text(json.dumps(isolated_results, indent=2) + "\n")
report = proof / "native-results.xml"
# Execute the verified, source-built artifact. The Bun CI build path ignores
# trailing execution arguments, so a successful build alone is not a test run.
result = subprocess.run([
    str(binary), "test", *tests, "--reporter=junit", f"--reporter-outfile={report}",
], cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(proof / "native-regressions.log").write_text(result.stdout)
print(result.stdout, end="")
cases = ET.parse(report).findall(".//testcase")
assert cases, "Native test runner executed no cases"
by_file = {filename: [] for filename in tests}
for case in cases:
    filename = Path(case.attrib["file"])
    if not filename.is_absolute():
        filename = source / filename
    relative = filename.resolve().relative_to(source.resolve()).as_posix()
    assert relative in by_file, f"Unexpected test source: {relative}"
    by_file[relative].append(case)
assert all(any(case.find("skipped") is None for case in group) for group in by_file.values()), \
    "Every selected native test file must execute a non-skipped case"
summary = {
    "binarySha256": expected["sha256"], "selectedFiles": tests,
    "cases": len(cases),
    "skipped": sum(case.find("skipped") is not None for case in cases),
    "failed": sum(case.find("failure") is not None or case.find("error") is not None for case in cases),
    "perFile": {filename: len(group) for filename, group in by_file.items()},
}
(proof / "native-results.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
result.check_returncode()
assert summary["failed"] == 0
assert all(run["passed"] for run in isolated_results)
