# Security

Keep real host profiles, private keys, environment files, and session transcripts out of Git. The bundled host profile uses a documentation-only address. Never put passwords in host profiles or command-line arguments.

## Sensitive Terminal Input

- Use `sensitive: true` when sending any secret. Input logging defaults off for raw input, but normal terminal echo still exists unless the input is marked sensitive or a common password prompt is detected.
- Sensitive input is not added to mirror input lines or replay input events, even with logging opt-ins. Literal echoes of submitted sensitive lines are replaced before entering session output, screen snapshots, mirrors, and exports. Possible secret prefixes are held across output chunks and redacted on close.
- Prompt detection is best effort. Custom, localized, multiline, or full-screen prompts may not be recognized. Prefer sending the complete secret in one sensitive call.
- Redaction is not a security boundary against a malicious server. Encoded, transformed, unrelated, or previously printed secrets are not automatically protected. MCP clients may record tool arguments independently.
- New transcript files are owner-readable/writable only; state and mirror directories are owner-only. Old transcripts are not purged or sanitized automatically.

Use SSH keys and narrowly scoped accounts where possible. Treat all terminal output and exports as potentially confidential, and inspect them before publishing.

## Reporting

Do not post secrets in public issues. Use GitHub private vulnerability reporting if enabled, or send a non-sensitive contact request to the repository owner through GitHub.
