# StackOS

Browse MCP (Model Context Protocol) servers by sector, build a stack (or boot a pre-made one), and export ready-to-use configs for **Claude** (Desktop + Code), **ChatGPT**, **Grok**, **Cursor** and **VS Code**.

- `public/` is the static SPA (vanilla JS, no build step). `public/data.js` holds the curated catalogue and stacks.
- `src/worker.js` is a Cloudflare Worker that serves the assets and proxies `/api/registry` → `registry.modelcontextprotocol.io/v0/servers` (cached 1 h) for the **Live scan**.

```bash
npm i
npm run dev      # wrangler dev on http://localhost:8787
npm test         # validates catalogue + every export
npm run deploy   # wrangler deploy (needs Cloudflare auth)
```

Exports per stack: `claude_desktop_config.json`, `claude-code-install.sh`, `.mcp.json`, `chatgpt-connectors.md/.json`, `grok-setup.md`, `grok-remote-mcp.json` (xAI Responses API body), Cursor `mcp.json`, VS Code `.vscode/mcp.json`, `.env.example`, `README.md`, or everything as a zip.
