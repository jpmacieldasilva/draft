# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.3.x | yes |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Email or message the repository owner with:

- A description of the issue
- Steps to reproduce
- Impact assessment (especially local file access or sandbox escape)

Draft runs a **local loopback server** that serves files from a workspace you open. Treat untrusted HTML as untrusted code. Only open workspaces from sources you trust.

## Scope

In scope:

- Path traversal or serving files outside the authorized workspace root
- Unauthorized write access to disk
- Cross-origin bypass of the iframe bridge

Out of scope:

- Prototype HTML executing inside the sandboxed iframe (by design, with reduced capabilities)
- Social engineering or issues in third-party dependencies without a practical exploit in this project

We aim to respond within 7 days.
