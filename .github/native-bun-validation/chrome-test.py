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
result = subprocess.run([
    str(binary), "test", "test/js/bun/webview/webview-chrome.test.ts", "-t", title,
    "--reporter=junit", f"--reporter-outfile={report}",
], cwd=source, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
(proof / "native-chrome.log").write_text(result.stdout)
print(result.stdout, end="")
cases = ET.parse(report).findall(".//testcase") if report.exists() else []
passed = result.returncode == 0 and len(cases) == 1 and all(
    not any(case.find(tag) is not None for tag in ["failure", "error", "skipped"])
    for case in cases
)
(proof / "native-chrome.json").write_text(json.dumps({
    "binarySha256": expected["sha256"], "title": title,
    "cases": len(cases), "passed": passed,
}, indent=2) + "\n")
assert passed, "Native Chromium ordering regression must execute and pass"
