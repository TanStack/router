import hashlib
import json
import os
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


root = Path(os.environ["GITHUB_WORKSPACE"])
binary = root / ".native-artifact/binary/bun"
proof = root / ".native-browser-proof"
proof.mkdir(exist_ok=True)
expected = json.loads((root / ".native-artifact/binary-proof.json").read_text())
manifest = json.loads((root / ".github/native-bun-validation/native-v12-manifest.json").read_text())
assert hashlib.sha256(binary.read_bytes()).hexdigest() == expected["sha256"]
assert expected["base"] == manifest["head"]
assert expected["patchSha256"] == manifest["trackedPatchSha256"]
assert expected["additionalFiles"] == manifest["additionalFiles"]
binary.chmod(0o755)
source = root / ".native-test-source"
subprocess.run([
    "python3", str(root / ".github/native-bun-validation/prepare.py"),
    "--bun", str(source), "--out", str(proof / "native-source"),
], check=True)
for cwd in [source, source / "test"]:
    subprocess.run([str(binary), "install", "--frozen-lockfile"], cwd=cwd, check=True)
tests = manifest["testCommand"].split(" test ", 1)[1].split()
assert len(tests) == 9
report = proof / "native-results.xml"
# Execute the verified, source-built artifact. The Bun CI build path ignores
# trailing execution arguments, so a successful build alone is not a test run.
result = subprocess.run([
    str(binary), "test", *tests, "--reporter=junit", f"--reporter-outfile={report}",
], cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(proof / "native-regressions.log").write_text(result.stdout)
print(result.stdout, end="")
result.check_returncode()
cases = ET.parse(report).findall(".//testcase")
assert cases, "Native test runner executed no cases"
assert not any(case.find("failure") is not None or case.find("error") is not None for case in cases)
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
    "perFile": {filename: len(group) for filename, group in by_file.items()},
}
(proof / "native-results.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary, indent=2))
