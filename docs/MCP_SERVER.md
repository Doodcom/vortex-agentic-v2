# Vortex MCP Server

`scripts/vortex-mcp.mjs` exposes this machine to any MCP client (Claude Code,
Claude Desktop, etc.) through Vortex's hardened exec layer. Stdio transport,
zero dependencies — plain Node.

## Register with Claude Code

```
claude mcp add vortex -- node "/home/doodcom/Documents/Vortex Agentic V2/scripts/vortex-mcp.mjs"
```

## Tools

| Tool | What it does |
|---|---|
| `system_stats` | uptime, memory, disk, top processes |
| `check_updates` | pending repo (checkupdates) + AUR (paru/yay) updates, read-only |
| `failed_units` | failed systemd units, system + user scope |
| `service_status` | `systemctl status` for one unit |
| `journal_logs` | journalctl with unit/lines/priority filters |
| `exec_command` | unprivileged shell exec behind the Vortex denylist |

## Safety model

- The exec denylist mirrors `EXEC_DENYLIST` in `electron/ollama.ts` (keep them
  in sync), plus an extra rule: **no sudo/pkexec/doas** — privileged actions
  stay in the Vortex GUI where a human clicks the polkit prompt.
- Every exec (allowed or denied) is appended to
  `~/.config/vortex-agentic-v2/mcp-audit.log`.
- Commands time out after 30 s; output is capped at 16 k chars.
