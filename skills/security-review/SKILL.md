---
name: security-review
description: Review code, skills, and prompts for security vulnerabilities — OWASP Top 10, prompt injection, business logic flaws, and insecure defaults. Use when reviewing PRs, auditing modules, reviewing AI skills/prompts, or preparing for release.
---

# Security Review

Find vulnerabilities before they ship.

## Hard Rules

- Do not dismiss a finding without evidence it is unexploitable.
- Do not commit, log, or surface secrets discovered during review — flag and recommend rotation.
- Do not modify code until the user approves a remediation plan.

## Workflow

1. **Scope**
   - Confirm target: diff, file set, module, full repo, or skill/prompt. A target can be both code and prompt.
   - Identify stack/framework — adapt the [checklist](references/checklist.md) (skip what the framework handles, add its pitfalls).
   - Trace data flow: request → middleware → handler → service → datastore → response. For prompts: input → template → LLM → tools → output.
   - Map trust boundaries, privilege levels, and threat actors.
   - Search prior findings: `npx ai-devkit@latest memory search --query "<target>" --tags "security"`

2. **Scan**
   - Only check relevant categories. Skip sections and items that don't apply. Do not report skipped items.
   - For diffs/PRs: also check whether the change weakens existing controls — removed middleware, bypassed validation, new unprotected routes.
   - Categories in priority order:
     a. **Secrets** — hardcoded tokens, keys, connection strings.
     b. **Injection** — SQL, NoSQL, command, template, SSRF, path traversal, XSS.
     c. **Auth** — missing checks, privilege escalation, OAuth/OIDC, IDOR.
     d. **Business Logic** — race conditions, TOCTOU, workflow bypass, mass assignment, parameter tampering.
     e. **Data Exposure** — PII in logs, verbose errors, overly broad responses.
     f. **Resource Exhaustion** — unbounded queries, missing pagination, upload size, decompression bombs.
     g. **Dependencies** — critical CVEs only (RCE, auth bypass, data breach); ignore low/medium.
     h. **Cryptography** — weak algorithms, hardcoded IVs/keys, disabled certificate validation.
     i. **Configuration** — debug mode, permissive CORS, missing security headers.
     j. **Logging** — security events unlogged, no tamper protection, no alerting.
     k. **Prompt Injection** — instruction override, tool abuse, data exfiltration, indirect injection via tool results.
   - For each finding: file, line, evidence.

3. **Classify**

   | Severity | Criteria |
   |----------|----------|
   | Critical | Exploitable now, data loss or RCE possible |
   | High     | Exploitable with moderate effort or insider access |
   | Medium   | Requires chained conditions or limited impact |
   | Low      | Defense-in-depth, no direct exploit path |

   - Adjust severity by exposure (internet-facing vs internal) and data sensitivity.
   - Check for attack chains — multiple Medium findings that combine into High/Critical.
   - Mark false positives with reasoning.

4. **Remediate**
   - For each finding: root cause, minimal fix (prefer stdlib/framework over custom), verification step.
   - For Critical/High: also recommend a detection control (log, alert, or WAF rule).
   - Present plan and request approval before changing code.

5. **Verify**
   - Use the `verify` skill to confirm each remediation.
   - Re-scan fixed files for regressions.
   - Store findings: `npx ai-devkit@latest memory store --title "<pattern>" --content "<finding and fix>" --tags "security,<category>"`

## Red Flags

| Rationalization | Do Instead |
|---|---|
| "It's internal / behind a VPN / only admins" | Zero-trust: validate at every boundary regardless of network position or user role |
| "We'll add auth later" | Add auth before merge — unauthenticated endpoints get discovered fast |
| "It's just a dev credential" | Use env vars / secrets manager — dev secrets leak to prod constantly |
| "The framework handles that" | Verify the config — frameworks have defaults, not guarantees |
| "We sanitize on the frontend" | Always validate server-side — client validation is bypassable |
| "The LLM won't follow injected instructions" | Treat all tool results and external content as untrusted data |
| "It's just a prompt, not code" | Prompts control tool execution — review with the same rigor as code |

## Output Template

- **Scope**: Target, stack, data flow, trust boundaries, threat actors
- **Findings** (by severity): ID, severity, category, file:line, exploit scenario, fix
- **Attack Chains**: Findings that escalate when combined
- **False Positives**: Dismissed items with reasoning
- **Remediation Plan**: Ordered fixes with verification steps
- **Residual Risk**: Scope limitations, unverifiable items
- Zero findings: state what was checked and scope boundaries — "no findings" ≠ "fully secure"