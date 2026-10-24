import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid
import xml.etree.ElementTree as ET


root = Path(os.environ["GITHUB_WORKSPACE"])
binary = root / ".native-artifact/binary/bun"
proof = root / ".native-browser-proof"
source = root / ".cache/native-bun-validation/test-source"
expected = json.loads((root / ".native-artifact/binary-proof.json").read_text())
assert hashlib.sha256(binary.read_bytes()).hexdigest() == expected["sha256"]
report = proof / "native-chrome.xml"
prefix = "native-final-chrome-" + uuid.uuid4().hex + "-"
title = "HMR applies a large update before the following small update"
# Use Bun's CI runner and its existing startup budget; do not override a test timeout.
command = [
    "node", "scripts/runner.node.ts", "--exec-path", str(binary),
    "--retries", "0", "--vendor", "false", "--junit", "--junit-temp-dir", prefix,
    "--results-json", str(proof / "native-chrome-runner.json"),
    "js/bun/webview/webview-chrome.test.ts",
]
result = subprocess.run(command, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        env={**os.environ, "PATH": str(binary.parent) + os.pathsep + os.environ["PATH"]})
(proof / "native-chrome.log").write_text(result.stdout)
print(result.stdout, end="")
reports = [path for base in {Path(tempfile.gettempdir()), Path("/tmp")}
           for folder in base.glob(prefix + "*") for path in folder.glob("*.xml")]
reports = [path for path in {path.resolve() for path in reports}
           if any(case.attrib.get("name", "") == title for case in ET.parse(path).findall(".//testcase"))]
assert len(reports) == 1, f"Expected the CI runner's JUnit report: {reports}"
shutil.copyfile(reports[0], report)
all_cases = ET.parse(report).findall(".//testcase")
cases = [case for case in all_cases if case.attrib.get("name", "") == title]
passed = result.returncode == 0 and len(cases) == 1 and all(
    not any(case.find(tag) is not None for tag in ["failure", "error", "skipped"])
    for case in cases
)
(proof / "native-chrome.json").write_text(json.dumps({
    "binarySha256": expected["sha256"], "title": title,
    "cases": len(cases), "passed": passed, "runnerCommand": command,
    "fullFileCases": len(all_cases),
    "fullFileSkipped": sum(case.find("skipped") is not None for case in all_cases),
}, indent=2) + "\n")
assert passed, "Native Chromium ordering regression must execute and pass"
