# Security Checklist

Identify the stack first. Skip items the framework handles by default; add framework-specific pitfalls. For AI skills/prompts, focus on the Prompt Injection section.

## Secrets

- [ ] No hardcoded keys, tokens, passwords, or connection strings
- [ ] No secrets in comments, TODOs, dead code, client bundles, or public assets
- [ ] Credential files in `.gitignore`; secrets loaded from env vars or secrets manager
- [ ] No secrets in logs, error output, or stack traces

## Injection

- [ ] SQL: parameterized statements, no string concatenation
- [ ] NoSQL: no user input in query operators (`$gt`, `$ne`)
- [ ] Command: array-based APIs, no shell interpolation
- [ ] Template: auto-escaping on; raw output justified
- [ ] SSRF: user-supplied URLs validated against allowlist
- [ ] Path traversal: canonicalized, restricted to base directory
- [ ] XSS: output encoding, CSP enforced
- [ ] ReDoS: user input in regex escaped or validated
- [ ] XXE: external entities disabled
- [ ] Deserialization: safe formats only (no pickle/yaml.load on untrusted data)

## Authentication & Authorization

- [ ] Every endpoint has explicit auth — no open-by-default
- [ ] Role/permission checks server-side, not UI-only
- [ ] JWT validated: signature, expiry, issuer, audience
- [ ] Sessions expire and invalidate on logout
- [ ] Passwords: bcrypt/scrypt/argon2 only
- [ ] CSRF protection on state-changing endpoints
- [ ] Rate limiting on auth endpoints
- [ ] IDOR: no user-controlled values in authz without server-side lookup
- [ ] OAuth/OIDC: state parameter validated, redirect URI allowlisted, tokens in httpOnly cookies

## Business Logic & Concurrency

- [ ] Race conditions: concurrent requests can't double-spend or corrupt state
- [ ] TOCTOU: no gap between permission check and action
- [ ] Workflow bypass: multi-step processes enforce ordering server-side
- [ ] Mass assignment: only allowlisted fields accepted
- [ ] Parameter tampering: prices, quantities, IDs validated server-side
- [ ] Batch endpoints: per-item authorization

## Data Exposure

- [ ] API responses return only necessary fields
- [ ] Errors don't leak stack traces, queries, or internal paths
- [ ] Logs free of PII, session tokens, and sensitive request bodies
- [ ] File uploads validated (type, size) and stored outside web root
- [ ] GraphQL: introspection disabled in prod, query depth limited

## Resource Exhaustion

- [ ] List/search endpoints enforce max page size and pagination
- [ ] Expensive operations require auth and are rate-limited
- [ ] File uploads enforce size limits at infra/middleware level
- [ ] No decompression of untrusted archives without size/entry limits

## Dependencies (Critical Only)

- [ ] No critical CVEs (CVSS 9.0+)
- [ ] No CISA Known Exploited Vulnerabilities
- [ ] Lockfile present and committed
- [ ] Post-install scripts reviewed for untrusted packages

## Cryptography

- [ ] No MD5/SHA1 for security purposes
- [ ] No ECB mode; no hardcoded keys, IVs, or salts
- [ ] TLS 1.2+ for external connections
- [ ] Security tokens/nonces from CSPRNG
- [ ] Certificate validation not disabled

## Configuration

- [ ] Debug mode off in production
- [ ] CORS: explicit allowlist, no wildcard with credentials
- [ ] Security headers: CSP, HSTS, X-Content-Type-Options, X-Frame-Options
- [ ] Cookies: Secure, HttpOnly, SameSite
- [ ] Admin endpoints not publicly accessible

## Logging & Monitoring

- [ ] Security events logged: failed auth, privilege changes, sensitive data access
- [ ] Logs protected from tampering
- [ ] Anomalous patterns trigger alerts

## Prompt Injection

- [ ] System/skill instructions not overridable by user input or tool results
- [ ] External content (file reads, API responses, tool output) treated as data, not instructions
- [ ] Tool calls scoped to minimum necessary; destructive tools require user confirmation
- [ ] No unsanitized user/external input passed as tool arguments (paths, commands, URLs)
- [ ] No path from untrusted input → prompt → tool call that leaks secrets or env vars
- [ ] LLM cannot be steered to send data to external services without user approval
- [ ] Multi-agent handoffs do not propagate unvalidated instructions between agents
- [ ] Skill permissions match stated scope (read-only skill has no write tools)
- [ ] Approval gates cannot be bypassed by crafted input
