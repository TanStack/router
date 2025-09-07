#!/usr/bin/env python3
import os
import re
import json

DOCS_ROOT = "/workspace/tanstack-router/docs/router"
OUT_JSON = "/workspace/router_docs_headings.json"
OUT_TSV = "/workspace/router_docs_headings.tsv"
OUT_FILES = "/workspace/router_docs_files.txt"


def collect_headings(root_dir: str):
    inventory = []
    all_files = []
    heading_regex = re.compile(r"^(#{1,6})\s+(.*)$")

    for dirpath, _, filenames in os.walk(root_dir):
        for filename in sorted(filenames):
            if not filename.endswith(".md"):
                continue
            abs_path = os.path.join(dirpath, filename)
            rel_path = os.path.relpath(abs_path, root_dir).replace("\\", "/")
            all_files.append(rel_path)

            headings = []
            try:
                with open(abs_path, "r", encoding="utf-8") as f:
                    for idx, line in enumerate(f, start=1):
                        m = heading_regex.match(line.rstrip("\n\r"))
                        if m:
                            level = len(m.group(1))
                            text = m.group(2).strip()
                            headings.append({
                                "line": idx,
                                "level": level,
                                "text": text,
                            })
            except Exception as e:
                headings.append({
                    "line": 0,
                    "level": 0,
                    "text": f"<read_error>: {e}",
                })

            inventory.append({
                "path": rel_path,
                "headings": headings,
            })

    return inventory, sorted(all_files)


def main():
    inventory, files = collect_headings(DOCS_ROOT)

    # Write JSON
    with open(OUT_JSON, "w", encoding="utf-8") as jf:
        json.dump(inventory, jf, ensure_ascii=False, indent=2)

    # Write TSV
    with open(OUT_TSV, "w", encoding="utf-8") as tf:
        for item in inventory:
            for h in item["headings"]:
                tf.write(f"{item['path']}|{h['line']}|{h['level']}|{h['text']}\n")

    # Write file list
    with open(OUT_FILES, "w", encoding="utf-8") as ff:
        for p in files:
            ff.write(p + "\n")

    print(f"Wrote {len(inventory)} files to: \n  {OUT_JSON}\n  {OUT_TSV}\n  {OUT_FILES}")


if __name__ == "__main__":
    main()

