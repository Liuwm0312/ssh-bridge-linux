# SSH Bridge Linux

Linux-only SSH Bridge plugin for Codex. It opens real PTY-backed interactive SSH sessions from a Linux Codex host and lets Codex read the screen, send keys, wait for prompts, inspect hosts, and optionally mirror the session for a human to watch.

## 中文说明

### 适合什么场景

当 Codex 部署在 Linux 机器上，并且需要像真实终端一样 SSH 到其他 Linux 主机时，使用这一版。

它适合：

- 交互式 SSH 登录
- `less`、`top`、`htop`、`vim`、`nano`、`jtop` 等真 PTY 程序
- 菜单式安装脚本、REPL、密码/确认提示
- 让用户旁观 Codex 的终端操作
- 多主机巡检、硬件画像、安全文件读写

### 核心能力

- 真 PTY SSH：远端看到的是一个真实伪终端。
- 当前屏幕解析：`ssh_linux_screen` 返回当前屏幕，而不是原始输出流。
- 终端状态判断：识别 shell、pager、editor、monitor、REPL、prompt、blank、closed。
- 特殊按键：Enter、Tab、Esc、Ctrl-C、Ctrl-D、方向键、PageUp/PageDown、Home/End、Delete、Backspace、q、F1-F12。
- 等待和 expect：等待某段文本出现，或等待多个候选结果之一。
- 可见镜像：默认关闭；需要时可调用 `ssh_linux_show_terminal`。
- Linux 镜像后端：优先图形终端，失败时使用 `tmux`。也支持自定义命令。
- 多主机与硬件画像：支持 Jetson、Raspberry Pi、x86 Intel/AMD、ARM Linux 等线索。
- 安全文件操作：read、backup、diff、write，写入要求先确认 diff。
- 会话记录和 replay：导出 transcript 或近似 replay 脚本。

### 安装到 Codex

插件根目录必须包含：

```text
.codex-plugin/plugin.json
.mcp.json
scripts/
skills/
```

如果你使用本地 marketplace，可以在 Codex 的本地插件目录里指向这个仓库。启用插件后，重启 Codex Desktop 或重新打开会话。

### hosts.json

在仓库根目录创建 `hosts.json`：

```json
{
  "example": {
    "host": "203.0.113.10",
    "user": "devops",
    "port": 22,
    "identityFile": "~/.ssh/id_ed25519_ssh_bridge_linux",
    "description": "Example Linux host",
    "tags": ["dev", "linux"]
  }
}
```

也可以复制 `hosts.example.json` 后修改。真实内网 IP 和用户名建议只保留在本机，不提交到 GitHub。

### 常用流程

1. 用 `ssh_linux_list_hosts` 查看主机别名。
2. 用 `ssh_linux_open_terminal` 打开会话。
3. 每次输入后用 `ssh_linux_read` 或 `ssh_linux_screen` 观察。
4. 需要让用户旁观时，用 `ssh_linux_show_terminal`。
5. 普通 shell 命令优先用 `ssh_linux_run_visible`，镜像里会显示 `$ command`。
6. 全屏程序里优先用 `ssh_linux_key` 发送 `q`、`ctrl-c`、方向键等。
7. 用 `ssh_linux_terminal_state` 判断当前是否在 pager/editor/monitor/REPL。
8. 完成后用 `ssh_linux_close` 关闭会话。

### Linux 镜像

镜像默认关闭。调用 `ssh_linux_show_terminal` 后，插件会创建一个只读 transcript，并尝试打开一个 Linux 旁观窗口。

优先级：

1. `SSH_BRIDGE_LINUX_MIRROR_COMMAND` 自定义命令
2. 图形终端：`gnome-terminal`、`konsole`、`xfce4-terminal`、`mate-terminal`、`lxterminal`、`xterm`、`alacritty`、`kitty`、`wezterm`、`x-terminal-emulator`
3. `tmux` 会话

如果退到 `tmux`，返回结果会提示：

```text
tmux attach -t <session-name>
```

自定义镜像命令可以使用这些占位符：

```text
{file}
{quotedFile}
{title}
{quotedTitle}
```

例如：

```text
SSH_BRIDGE_LINUX_MIRROR_COMMAND='xterm -T {quotedTitle} -e bash -lc "tail -n +1 -f {quotedFile}"'
```

停止镜像：

```json
{
  "session": "dev",
  "closeTail": true,
  "closeWindow": true
}
```

### 主要工具

- `ssh_linux_list_hosts`
- `ssh_linux_open_terminal`
- `ssh_linux_send`
- `ssh_linux_read`
- `ssh_linux_screen`
- `ssh_linux_key`
- `ssh_linux_wait_for_text`
- `ssh_linux_type_and_wait`
- `ssh_linux_run_visible`
- `ssh_linux_expect`
- `ssh_linux_terminal_state`
- `ssh_linux_show_terminal`
- `ssh_linux_hide_terminal`
- `ssh_linux_resize`
- `ssh_linux_list_sessions`
- `ssh_linux_host_profile`
- `ssh_linux_fleet_summary`
- `ssh_linux_session_record`
- `ssh_linux_session_replay`
- `ssh_linux_read_file`
- `ssh_linux_backup_file`
- `ssh_linux_diff_file`
- `ssh_linux_write_file`
- `ssh_linux_close`

### 安全说明

这版非常接近真实终端，能力强，也更容易误操作。对生产机器执行写入、删除、部署、权限修改前，需要先确认目标主机和命令含义。文件写入工具默认要求先看 diff，并建议保留备份。

### 版权与许可证

Copyright 2026 Liuwm0312

本项目基于 Apache License 2.0 开源。详见 [LICENSE](LICENSE)。

## English

### What This Is For

Use this plugin when Codex runs on Linux and needs to operate remote Linux machines through real interactive SSH terminals.

It supports:

- Interactive SSH sessions
- Full-screen PTY programs such as `less`, `top`, `htop`, `vim`, `nano`, and `jtop`
- Menu installers, REPLs, password prompts, and confirmation prompts
- Optional human-visible terminal mirroring
- Fleet summaries, hardware profiles, safer file operations, and session records

### Capabilities

- Real PTY-backed SSH sessions.
- Screen snapshots through `ssh_linux_screen`.
- Terminal state classification for shell, pager, editor, monitor, REPL, prompt, blank, and closed states.
- Named keys for Enter, Tab, Esc, Ctrl-C, Ctrl-D, arrows, PageUp/PageDown, Home/End, Delete, Backspace, q, and F1-F12.
- Wait and expect helpers.
- Optional Linux terminal mirroring.
- Mirror backends for graphical terminals, `tmux`, or a custom command.
- Fleet and hardware profiling.
- Safer read/backup/diff/write file tools.
- Session transcript and replay export.

### Linux Mirror Backends

Mirroring is off by default. Call `ssh_linux_show_terminal` when the user wants to watch.

Backend order:

1. `SSH_BRIDGE_LINUX_MIRROR_COMMAND`
2. Graphical terminal emulators
3. `tmux`

If `tmux` is used, attach with the command returned by the tool.

### Environment Variables

- `SSH_BRIDGE_LINUX_HOSTS_FILE`
- `SSH_BRIDGE_LINUX_STRICT_HOST_KEY_CHECKING`
- `SSH_BRIDGE_LINUX_DEFAULT_IDENTITY_FILE`
- `SSH_BRIDGE_LINUX_PYTHON`
- `SSH_BRIDGE_LINUX_SHOW_ON_OPEN`
- `SSH_BRIDGE_LINUX_MAX_BUFFER_BYTES`
- `SSH_BRIDGE_LINUX_MIRROR_COMMAND`

### Notes

This is intentionally close to a real terminal. Prefer short, observable actions, read the screen after each important input, and use the safer file tools for remote edits.

### Copyright And License

Copyright 2026 Liuwm0312

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE).
