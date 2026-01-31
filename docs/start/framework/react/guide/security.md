---
id: security
title: Security FAQ
---

Answers to common security questions about TanStack Start.

## Is TanStack Start secure by default?

Yes. TanStack Start includes built-in protections against common web vulnerabilities:

| Attack Vector | Protection |
|--------------|------------|
| CSRF | POST enforcement, custom headers, SameSite cookie support |
| Serialization attacks | Hardened serializer tested against all known CVEs and proactively researched against emerging attack vectors |
| SSRF | Origin derived from `request.url`, not client headers |
| Open redirects | URL sanitization (CR/LF stripping, protocol-relative URL prevention) |
| XSS | CSP nonce support for inline scripts |
| DoS | Payload size limits on requests |

## What's automatic vs what do I need to configure?

**Automatic (zero configuration):**
- POST enforcement for server function mutations
- Custom header requirement (`x-tsr-serverFn`) on server function requests
- Origin validation from `request.url`
- Serialization hardening
- URL sanitization
- Payload size limits

**You configure (app-specific):**
- **SameSite cookie policy** - we provide the option, you choose `'lax'` or `'strict'` based on your app's cross-site requirements
- **Input validation schemas** - we provide `.inputValidator()`, you define what valid data looks like for your domain
- **CSP nonce** - we propagate your nonce to all scripts; you generate and configure it per-request
- **Authentication & authorization** - session management is provided, but auth logic is app-specific
- **Rate limiting** - depends on your infrastructure and traffic patterns

**Optional (if needed):**
- **CSRF tokens** - only needed for legacy browsers that don't support SameSite cookies; implement via middleware if required

We can't make every security decision for you because the right choice depends on your specific application. A banking app needs `sameSite: 'strict'`, while an app with legitimate cross-site embeds might need `'lax'`. Your validation schemas depend on your data model. Auth depends on your user system.

## What about RSC (React Server Components) security?

TanStack Start's server function architecture uses a unidirectional data flow - the server sends data to the client, but the client does not send serialized component payloads back to the server for parsing.

This architecture is not susceptible to the class of RSC vulnerabilities disclosed in late 2025, including:

- [CVE-2025-55182](https://react.dev/blog/2025/12/03/critical-security-vulnerability-in-react-server-components) - Remote code execution via RSC payload deserialization
- [CVE-2025-55184](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components) - Denial of service
- [CVE-2025-55183](https://react.dev/blog/2025/12/11/denial-of-service-and-source-code-exposure-in-react-server-components) - Source code exposure

These vulnerabilities affect frameworks that parse RSC Flight payloads on the server from client requests.

## How should I validate user input?

Use the `.inputValidator()` method on server functions. See [Server Function Validation](./server-functions#validation).

## How do I keep secrets safe?

Use `createServerFn()` or `createServerOnlyFn()` to ensure code only runs on the server. See [Execution Model](./execution-model).

## How do I report a security issue?

Do not open a public GitHub issue. Email security concerns to the maintainers and allow time for a fix before public disclosure.
