import hashlib
import json
import os
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET


root = Path(os.environ["GITHUB_WORKSPACE"])
binary = root / ".native-artifact/binary/bun"
proof = root / ".native-browser-proof"
source = root / ".cache/native-bun-validation/test-source"
expected = json.loads((root / ".native-artifact/binary-proof.json").read_text())
assert hashlib.sha256(binary.read_bytes()).hexdigest() == expected["sha256"]
report = proof / "native-chrome.xml"
title = "HMR applies a large update before the following small update"
# Match the existing CI runner's budget without starting its crash-remap service.
runner = (source / "scripts/runner.node.ts").read_text()
assert "const testTimeout = 3 * 60_000;" in runner
assert "const perTestTimeout = Math.ceil(timeout / 2) * (isAsan ? 3 : 1);" in runner
command = [
    str(binary), "test", "test/js/bun/webview/webview-chrome.test.ts", "-t", title,
    "--timeout=90000", "--reporter=junit", f"--reporter-outfile={report}",
]
result = subprocess.run(command, cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(proof / "native-chrome.log").write_text(result.stdout)
print(result.stdout, end="")
all_cases = ET.parse(report).findall(".//testcase") if report.exists() else []
cases = [case for case in all_cases if case.attrib.get("name", "") == title]
passed = result.returncode == 0 and len(cases) == 1 and all(
    not any(case.find(tag) is not None for tag in ["failure", "error", "skipped"])
    for case in cases
) and all(case.find("skipped") is not None for case in all_cases if case not in cases)
(proof / "native-chrome.json").write_text(json.dumps({
    "binarySha256": expected["sha256"], "title": title,
    "cases": len(cases), "filteredOut": len(all_cases) - len(cases), "passed": passed,
    "budgetSource": "scripts/runner.node.ts: testTimeout / 2 (stable CI)",
    "command": command,
}, indent=2) + "\n")
assert passed, "Native Chromium ordering regression must execute and pass"
