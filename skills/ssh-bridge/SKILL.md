---
name: ssh-bridge
description: Use when Codex should operate an interactive Linux PTY-backed SSH terminal session through the ssh-bridge-linux plugin.
---

# SSH Bridge Linux

Use this skill for the Linux-only interactive PTY version of SSH Bridge.

## Tool Preference

- Use `ssh_linux_list_hosts` to inspect configured aliases.
- Use `ssh_linux_open_terminal` to start a named interactive SSH session.
- Use `ssh_linux_send` to send commands or raw keystrokes.
- Use `ssh_linux_read` after every send to observe the terminal state.
- Use `ssh_linux_screen` when you need the current rendered terminal screen rather than raw output history.
- Use `ssh_linux_key` for named keys such as `enter`, `tab`, `ctrl-c`, `ctrl-d`, `escape`, arrows, `page-up`, and `page-down`.
- Use `ssh_linux_wait_for_text` after sending input when waiting for a prompt, menu, login banner, or command output.
- Use `ssh_linux_type_and_wait` for terminal-like "type, wait, inspect" interactions.
- Use `ssh_linux_run_visible` for normal shell commands when a mirror is enabled so the user sees the command text.
- Use `ssh_linux_expect` when several prompts or outcomes are possible.
- Use `ssh_linux_terminal_state` before acting inside full-screen or ambiguous terminal states.
- Use `ssh_linux_show_terminal` only when the user asks to watch the session locally.
- Do not call `ssh_linux_show_terminal` repeatedly for the same session unless the user closed the previous mirror and asks to reopen it; use `reopen: true` in that case.
- Use `ssh_linux_hide_terminal` when the user asks to stop showing local terminal output; pass `closeTail: true` and `closeWindow: true` when they want the watcher closed too.
- Use `ssh_linux_resize` when full-screen output wraps badly.
- Use `ssh_linux_host_profile` for one-host inventory and hardware detection.
- Use `ssh_linux_fleet_summary` when the user asks about multiple configured hosts.
- Use `ssh_linux_session_record` when the user wants a transcript, record, or recap of an interactive session.
- Use `ssh_linux_session_replay` when the user wants a best-effort replay script for a session.
- Use `ssh_linux_read_file`, `ssh_linux_backup_file`, `ssh_linux_diff_file`, and `ssh_linux_write_file` for safer remote file edits.
- Use `ssh_linux_close` when the session is no longer needed.

## Interaction Rules

- Always read the terminal output after opening a session.
- Prefer `ssh_linux_screen` after opening or changing full-screen programs.
- Treat `ssh_linux_screen` as the current rendered display, not a raw output stream; it includes best-effort xterm parsing for alternate screen, scroll regions, cursor save/restore, and line/character insert/delete.
- Prefer `ssh_linux_terminal_state` when the screen may be a pager, editor, monitor, REPL, or interactive prompt.
- Do not enable local Linux terminal mirroring unless the user asks; the default is headless PTY operation.
- For shell commands, prefer `ssh_linux_run_visible` over raw `ssh_linux_send` so command text is captured cleanly in mirrors.
- Prefer `ssh_linux_key` over raw control characters when a named key exists.
- For full-screen programs, use raw keystrokes deliberately:
  - `q` to quit many pagers and monitors.
  - `\u0003` for Ctrl-C.
  - `\u0004` for Ctrl-D.
  - `\u001b` for Escape.
- Prefer short, observable steps. Do not send a long destructive command chain into an interactive terminal.
- Before writing a remote file, prefer `ssh_linux_diff_file`; call `ssh_linux_write_file` only after the diff is reviewed and `diffAck` is true.
- Use absolute remote paths for file tools.
- Close idle sessions when finished.

## Mirror Rules

- Linux mirroring may open a graphical terminal, create a `tmux` session, or use `SSH_BRIDGE_LINUX_MIRROR_COMMAND`.
- If the mirror backend is `tmux`, tell the user the returned `tmux attach -t ...` command when they need to watch.
- The mirror is read-only from the user's perspective. Codex still controls the real PTY through the MCP tools.

## Safety

This plugin is close to a real terminal. Use extra care on production hosts. For audited file writes, deploys, approvals, and policy-heavy changes, prefer the safer file tools and explicit confirmation.
