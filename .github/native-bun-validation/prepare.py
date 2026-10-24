import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile


BASE = "dca7d25e95cca39316c659a377dba6803805549f"
PATCH_HASH = "d4d09320680f3602c018b157fd5bbb595f9c2fda30b81a583dbaf8a1e043cd76"
ADDITIONAL = {
    "src/bundler/input_source_map.rs",
    "src/runtime/bake/dev_server/plugin_watch_store.rs",
    "src/sourcemap/InputSourceMap.rs",
    "test/bake/dev/barrel-hmr-renaming.test.ts",
    "test/bake/dev/barrel-hmr.test.ts",
    "test/bake/dev/client-plugin-cache.test.ts",
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def allowed(name):
    path = PurePosixPath(name)
    return (
        not path.is_absolute()
        and ".." not in path.parts
        and "\\" not in name
        and (
            name.startswith(("src/", "test/", "docs/"))
            or name in {"Cargo.lock", "packages/bun-types/bun.d.ts"}
        )
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bun", type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--check-assets-only", action="store_true")
    args = parser.parse_args()
    data = Path(__file__).resolve().parent
    manifest = json.loads((data / "native-v12-manifest.json").read_text())
    assert manifest["head"] == BASE
    assert manifest["trackedPatchSha256"] == PATCH_HASH
    assert set(manifest["additionalFiles"]) == ADDITIONAL
    patch = gzip.decompress((data / "native-v12-tracked.patch.gz").read_bytes())
    assert digest(patch) == PATCH_HASH, "Tracked patch hash mismatch"
    paths = re.findall(rb"^diff --git a/(\S+) b/(\S+)$", patch, re.MULTILINE)
    assert paths, "No tracked patch paths"
    tracked = []
    for old, new in paths:
        assert old == new and allowed(old.decode()), "Unexpected tracked path"
        tracked.append(old.decode())
    extra = {}
    archive = gzip.decompress(
        (data / "native-v12-additional-files.tar.gz").read_bytes()
    )
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        for member in bundle.getmembers():
            assert member.isfile(), "Non-regular archive entry"
            assert member.name in ADDITIONAL and allowed(member.name)
            assert member.name not in extra, "Duplicate archive entry"
            content = bundle.extractfile(member).read()
            assert digest(content) == manifest["additionalFiles"][member.name]
            extra[member.name] = content
    assert set(extra) == ADDITIONAL
    print(json.dumps({"base": BASE, "patchSha256": PATCH_HASH,
                      "trackedPaths": tracked, "additionalFiles": manifest["additionalFiles"]}, indent=2))
    if args.check_assets_only:
        return
    assert args.bun and args.out, "--bun and --out are required"
    bun = args.bun.resolve()
    out = args.out.resolve()
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=bun, text=True).strip()
    assert actual == BASE, "Unexpected Bun checkout"
    assert not subprocess.check_output(["git", "status", "--porcelain"], cwd=bun), "Bun checkout is dirty"
    for name in extra:
        assert not (bun / name).exists(), "Additional file already exists"
    subprocess.run(["git", "apply", "--check", "-"], input=patch, cwd=bun, check=True)
    subprocess.run(["git", "apply", "-"], input=patch, cwd=bun, check=True)
    for name, content in extra.items():
        target = bun / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    subprocess.run(["git", "diff", "--check"], cwd=bun, check=True)
    for name, expected in manifest["changedSourceSha256"].items():
        assert allowed(name) and name in tracked
        assert digest((bun / name).read_bytes()) == expected, f"Source hash mismatch: {name}"
    out.mkdir(parents=True, exist_ok=True)
    with tarfile.open(out / "applied-source.tar.gz", "w:gz") as bundle:
        for name in sorted(set(tracked) | ADDITIONAL):
            bundle.add(bun / name, arcname=name)
    (out / "native-v12-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (out / "tracked.patch").write_bytes(patch)
    for name in ["CONTRIBUTING.md", "rust-toolchain.toml", "package.json"]:
        (out / name).write_bytes((bun / name).read_bytes())


if __name__ == "__main__":
    main()
