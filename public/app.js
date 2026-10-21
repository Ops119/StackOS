(function () {
  "use strict";
  var SECTORS = window.STACKOS_SECTORS, CURATED = window.STACKOS_SERVERS, STACKS = window.STACKOS_STACKS;
  var registry = []; // live-scanned entries
  function all() { return CURATED.concat(registry); }
  function byId(id) { return all().find(function (s) { return s.id === id; }); }

  // ---------------- export engine (pure) ----------------
  function placeholders(str) { var out = [], re = /<([A-Z0-9_]+)>/g, m; while ((m = re.exec(str))) out.push(m[1]); return out; }
  function envOf(s) { // env vars a server needs, with description
    var env = {};
    if (s.local) {
      Object.keys(s.local.env || {}).forEach(function (k) { env[k] = s.local.env[k]; });
      s.local.args.forEach(function (a) { placeholders(a).forEach(function (k) { if (!env[k]) env[k] = "value for " + k; }); });
    }
    if (s.remote) ((s.remote.headers || []).map(function (h) { return h.value; }).concat([s.remote.url])).forEach(function (v) { placeholders(v).forEach(function (k) { if (!env[k]) env[k] = "value for " + k; }); });
    if (false) placeholders(s.remote.url).forEach(function (k) { if (!env[k]) env[k] = "value for " + k; });
    return env;
  }
  function remoteOk(s) { return !!s.remote; }
  function preferRemote(s) { return !!s.remote; } // for http-capable clients
  function slug(id) { return id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60); }
  function localEnvBlock(s) { var e = {}; Object.keys((s.local && s.local.env) || {}).forEach(function (k) { e[k] = "<" + k + ">"; }); return e; }
  function shq(a) { return /^[A-Za-z0-9_@%+=:,./<>-]+$/.test(a) && !/[<>]/.test(a) ? a : "'" + a.replace(/'/g, "'\\''") + "'"; }

  function hdrs(s) { var h = {}; ((s.remote && s.remote.headers) || []).forEach(function (x) { h[x.name] = x.value; }); return h; }
  function withHdr(o, s) { var h = hdrs(s); if (Object.keys(h).length) o.headers = h; return o; }
  function claudeDesktop(list) {
    var cfg = { mcpServers: {} };
    list.forEach(function (s) {
      var k = slug(s.id);
      if (s.local) {
        var e = { command: s.local.cmd, args: s.local.args.slice() };
        var env = localEnvBlock(s); if (Object.keys(env).length) e.env = env;
        cfg.mcpServers[k] = e;
      } else if (s.remote) {
        var args = ["-y", "mcp-remote", s.remote.url];
        if (s.remote.transport === "sse") args.push("--transport", "sse-only");
        var hh = hdrs(s); Object.keys(hh).forEach(function (n) { args.push("--header", n + ":" + hh[n]); });
        cfg.mcpServers[k] = { command: "npx", args: args };
      }
    });
    return cfg;
  }
  function claudeCode(list) {
    var lines = ["#!/usr/bin/env bash", "# StackOS → Claude Code. Run in your project (add --scope user to install globally).", "# Replace every <PLACEHOLDER> first. OAuth servers: run /mcp inside Claude Code to log in.", "set -e", ""];
    list.forEach(function (s) {
      lines.push("# " + s.name + (s.remote && s.remote.note ? " — " + s.remote.note : ""));
      if (preferRemote(s)) {
        lines.push("claude mcp add --transport " + (s.remote.transport === "sse" ? "sse" : "http") + " " + slug(s.id) + " " + shq(s.remote.url) + Object.keys(hdrs(s)).map(function (n) { return " --header " + shq(n + ": " + hdrs(s)[n]); }).join(""));
      } else if (s.local) {
        var env = Object.keys(s.local.env || {}).map(function (k) { return "-e " + k + "=" + shq("<" + k + ">"); }).join(" ");
        lines.push("claude mcp add " + (env ? env + " " : "") + slug(s.id) + " -- " + [s.local.cmd].concat(s.local.args).map(shq).join(" "));
      }
      lines.push("");
    });
    return lines.join("\n");
  }
  function claudeCodeJson(list) { // project-scoped .mcp.json
    var cfg = { mcpServers: {} };
    list.forEach(function (s) {
      if (preferRemote(s)) cfg.mcpServers[slug(s.id)] = withHdr({ type: s.remote.transport === "sse" ? "sse" : "http", url: s.remote.url }, s);
      else if (s.local) { var e = { type: "stdio", command: s.local.cmd, args: s.local.args.slice() }; var env = localEnvBlock(s); if (Object.keys(env).length) e.env = env; cfg.mcpServers[slug(s.id)] = e; }
    });
    return cfg;
  }
  function cursorJson(list) {
    var cfg = { mcpServers: {} };
    list.forEach(function (s) {
      if (preferRemote(s)) cfg.mcpServers[slug(s.id)] = withHdr({ url: s.remote.url }, s);
      else if (s.local) { var e = { command: s.local.cmd, args: s.local.args.slice() }; var env = localEnvBlock(s); if (Object.keys(env).length) e.env = env; cfg.mcpServers[slug(s.id)] = e; }
    });
    return cfg;
  }
  function vscodeJson(list) {
    var cfg = { servers: {} };
    list.forEach(function (s) {
      if (preferRemote(s)) cfg.servers[slug(s.id)] = withHdr({ type: s.remote.transport === "sse" ? "sse" : "http", url: s.remote.url }, s);
      else if (s.local) { var e = { type: "stdio", command: s.local.cmd, args: s.local.args.slice() }; var env = localEnvBlock(s); if (Object.keys(env).length) e.env = env; cfg.servers[slug(s.id)] = e; }
    });
    return cfg;
  }
  function authLabel(s) {
    var a = s.remote && s.remote.auth;
    return { oauth: "OAuth (sign in when prompted)", none: "No auth", optional: "No auth (optional token)", urlkey: "API key inside the URL", bearer: "Bearer token" }[a] || "—";
  }
  function chatgptJson(list) {
    return {
      client: "ChatGPT",
      how: "Settings → Plugins/Apps → + → Add custom MCP server (needs a plan with custom MCP / developer mode). Paste server_url, pick the auth type.",
      supported: list.filter(remoteOk).map(function (s) { return { name: s.name, server_url: s.remote.url, transport: s.remote.transport === "sse" ? "SSE" : "Streamable HTTP", authentication: s.remote.auth === "oauth" ? "OAuth" : "No authentication", note: s.remote.note || undefined, docs: s.docs }; }),
      local_only_not_supported: list.filter(function (s) { return !s.remote; }).map(function (s) { return { name: s.name, reason: "stdio/local server: ChatGPT can only reach public HTTPS MCP endpoints. Host it remotely or expose it with a Secure MCP Tunnel.", docs: s.docs }; })
    };
  }
  function chatgptMd(list) {
    var ok = list.filter(remoteOk), no = list.filter(function (s) { return !s.remote; });
    var o = ["# StackOS → ChatGPT", "", "ChatGPT connects to **remote** MCP servers only (Streamable HTTP or SSE over public HTTPS). Local `npx`/`uvx`/`docker` servers can't be added directly.", "", "## Setup (ChatGPT web)", "1. Your plan must allow custom MCP servers (Business/Enterprise/Edu have full read + write; other plans may be limited or need Developer mode). Admins may need to enable it in workspace settings.", "2. Open **Settings → Plugins** (older UI: *Apps & Connectors → Advanced → Developer mode → Create*).", "3. Click **+ → Add custom MCP server**, give it a name, paste the **Server URL** below, choose the authentication type, accept the warning and create it.", "4. In a new chat type `@` and pick the server, or say *“Use the <name> app to …”*.", "", "## Your servers (" + ok.length + " ready)", "", "| Server | Server URL | Auth | Notes |", "|---|---|---|---|"];
    ok.forEach(function (s) { o.push("| " + s.name + " | `" + s.remote.url + "` | " + (s.remote.auth === "oauth" ? "OAuth" : "None") + " | " + ((s.remote.auth === "urlkey" ? "Replace the key placeholder in the URL. " : "") + (s.remote.note || "")).replace(/\|/g, "/") + " |"); });
    if (no.length) {
      o.push("", "## ⚠ Local-only — not usable in ChatGPT as-is (" + no.length + ")", "", "These run on your machine over stdio. To use them in ChatGPT you'd have to host them behind an HTTPS endpoint (e.g. an HTTP wrapper plus ChatGPT's Secure MCP Tunnel). They still work in Claude, Cursor and VS Code.", "");
      no.forEach(function (s) { o.push("- **" + s.name + "** — `" + [s.local.cmd].concat(s.local.args).join(" ") + "` ([docs](" + s.docs + "))"); });
    }
    o.push("", "_Note: ChatGPT custom servers support OAuth or no-auth. Servers that need a fixed API-key header won't work unless the key can go in the URL._", "");
    return o.join("\n");
  }
  function grokJson(list) {
    return {
      model: "grok-4.6",
      input: [{ role: "user", content: "List the tools you have available from my MCP servers." }],
      tools: list.filter(remoteOk).map(function (s) {
        var t = { type: "mcp", server_url: s.remote.url, server_label: slug(s.id).replace(/-/g, "_"), server_description: s.desc };
        if (s.remote.auth === "oauth" || s.remote.auth === "bearer") t.authorization = "<" + (s.remote.authEnv || slug(s.id).toUpperCase().replace(/-/g, "_") + "_ACCESS_TOKEN") + ">";
        var h = hdrs(s); if (h.Authorization) { t.authorization = h.Authorization.replace(/^Bearer\s+/i, ""); delete h.Authorization; }
        if (Object.keys(h).length) t.headers = h;
        return t;
      })
    };
  }
  function grokMd(list) {
    var ok = list.filter(remoteOk), no = list.filter(function (s) { return !s.remote; });
    var o = ["# StackOS → Grok", "", "Grok supports **remote** MCP servers (Streamable HTTP and SSE) two ways. stdio/local servers are not supported, and Grok rejects localhost/private URLs.", "", "## A) grok.com: custom MCP connector", "1. In Grok, open **Connectors** and add a **custom MCP connector**.", "2. Paste a Server URL from the table below. For OAuth servers Grok runs the sign-in flow.", "3. Local servers need a public tunnel (ngrok, or `cloudflared tunnel --url http://localhost:PORT` for Streamable HTTP; Cloudflare quick tunnels don't support SSE).", "", "## B) xAI API (Remote MCP Tools)", "`grok-remote-mcp.json` in this bundle is a ready request body for `POST https://api.x.ai/v1/responses`:", "", "```bash", "curl https://api.x.ai/v1/responses \\", "  -H \"Content-Type: application/json\" \\", "  -H \"Authorization: Bearer $XAI_API_KEY\" \\", "  -d @grok-remote-mcp.json", "```", "", "- `authorization` is sent as the Authorization header to that MCP server. The API doesn't run OAuth for you, so OAuth-only servers need an access token you already have (or drop them and use grok.com connectors instead).", "- Optional: `allowed_tools` to cap which tools load (saves context). `require_approval` and `connector_id` are not supported by xAI.", "- Swap `model` for whichever Grok model you use.", "", "## Your servers (" + ok.length + " remote)", "", "| Server | server_url | Auth |", "|---|---|---|"];
    ok.forEach(function (s) { o.push("| " + s.name + " | `" + s.remote.url + "` | " + authLabel(s) + " |"); });
    if (no.length) { o.push("", "## ⚠ Local-only — need a tunnel or a hosted version (" + no.length + ")", ""); no.forEach(function (s) { o.push("- **" + s.name + "** — `" + [s.local.cmd].concat(s.local.args).join(" ") + "`"); }); }
    o.push("");
    return o.join("\n");
  }
  function envExample(list) {
    var o = ["# StackOS — keys and tokens for your stack. Fill these in; never commit this file.", ""];
    list.forEach(function (s) {
      var env = envOf(s), keys = Object.keys(env);
      var extra = s.remote && s.remote.authEnv && keys.indexOf(s.remote.authEnv) < 0 ? s.remote.authEnv : null;
      if (!keys.length && !extra) return;
      o.push("# " + s.name + " — " + s.docs);
      keys.forEach(function (k) { o.push(k + "=   # " + env[k]); });
      if (extra) o.push(extra + "=   # only needed for token auth instead of OAuth");
      o.push("");
    });
    if (o.length === 2) o.push("# Nothing to fill in: every server in this stack uses OAuth or no auth.");
    return o.join("\n") + "\n";
  }
  function readme(list, name) {
    var o = ["# " + (name || "My StackOS stack"), "", "Generated by StackOS on " + new Date().toISOString().slice(0, 10) + ". " + list.length + " MCP servers.", "", "| Server | Sector | Remote | Local | Docs |", "|---|---|---|---|---|"];
    list.forEach(function (s) { var sec = SECTORS.find(function (x) { return x.id === s.sector; }); o.push("| " + s.name + " | " + (sec ? sec.name : "Registry") + " | " + (s.remote ? "✓" : "—") + " | " + (s.local ? "`" + s.local.cmd + "`" : "—") + " | " + s.docs + " |"); });
    o.push("", "## Files", "", "- `claude/claude_desktop_config.json` — Claude Desktop (Settings → Developer → Edit Config). Merge `mcpServers` into yours and restart Claude. Remote-only servers go through the `mcp-remote` bridge; alternatively add them as Custom Connectors in Claude.", "- `claude/claude-code-install.sh` — `claude mcp add …` commands for Claude Code.", "- `claude/.mcp.json` — project-scoped config for Claude Code (commit it to share with your team).", "- `chatgpt/chatgpt-connectors.md` + `.json` — remote URLs for ChatGPT custom MCP servers, local-only ones flagged.", "- `grok/grok-setup.md` + `grok-remote-mcp.json` — grok.com connectors + xAI Remote MCP Tools request body.", "- `cursor/mcp.json` — Cursor (`~/.cursor/mcp.json` or `.cursor/mcp.json`).", "- `vscode/mcp.json` — VS Code (`.vscode/mcp.json`).", "- `.env.example` — every API key / token placeholder in this stack.", "", "## Requirements", "", "- `npx` needs Node.js 18+; `uvx` needs [uv](https://docs.astral.sh/uv/); `docker` needs Docker running.", "- On Windows, if `npx` fails in Claude Desktop, use `\"command\": \"cmd\", \"args\": [\"/c\", \"npx\", ...]`.", "- Replace every `<PLACEHOLDER>` before use. Only connect MCP servers you trust: they can read and act on your data.", "");
    return o.join("\n");
  }
  function buildFiles(list, name) {
    var j = function (x) { return JSON.stringify(x, null, 2) + "\n"; };
    return {
      claude: [
        { path: "claude/claude_desktop_config.json", content: j(claudeDesktop(list)), note: "Claude Desktop → Settings → Developer → Edit Config" },
        { path: "claude/claude-code-install.sh", content: claudeCode(list), note: "Claude Code CLI" },
        { path: "claude/.mcp.json", dl: "claude-code.mcp.json", content: j(claudeCodeJson(list)), note: "Claude Code project config (save as .mcp.json)" }],
      chatgpt: [
        { path: "chatgpt/chatgpt-connectors.md", content: chatgptMd(list), note: "Setup steps + URLs" },
        { path: "chatgpt/chatgpt-connectors.json", content: j(chatgptJson(list)), note: "Machine-readable list" }],
      grok: [
        { path: "grok/grok-setup.md", content: grokMd(list), note: "grok.com connectors + xAI API" },
        { path: "grok/grok-remote-mcp.json", content: j(grokJson(list)), note: "POST api.x.ai/v1/responses body" }],
      cursor: [{ path: "cursor/mcp.json", dl: "cursor-mcp.json", content: j(cursorJson(list)), note: "~/.cursor/mcp.json" }],
      vscode: [{ path: "vscode/mcp.json", dl: "vscode-mcp.json", content: j(vscodeJson(list)), note: ".vscode/mcp.json" }],
      env: [{ path: ".env.example", dl: "stackos.env.example", content: envExample(list), note: "API keys to fill in" }, { path: "README.md", content: readme(list, name), note: "Stack overview" }]
    };
  }

  // ---------------- tiny zip writer (store) ----------------
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function zip(files) {
    var enc = new TextEncoder(), parts = [], central = [], off = 0;
    var d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    files.forEach(function (f) {
      var name = enc.encode(f.path), data = enc.encode(f.content), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/zip" });
  }

  window.StackOSExport = { buildFiles: buildFiles, zip: zip, envOf: envOf };
  if (typeof document === "undefined" || !document.getElementById("grid")) return;

  // ---------------- UI ----------------
  var $ = function (id) { return document.getElementById(id); };
  var state = { sector: "all", q: "", stack: [], tab: "claude", file: 0, stackName: "" };
  try { var saved = JSON.parse(localStorage.getItem("stackos") || "{}"); if (saved.stack) state.stack = saved.stack; if (saved.reg) registry = saved.reg; } catch (e) {}
  var hm = location.hash.match(/stack=([^&]+)/);
  if (hm) { var ids = decodeURIComponent(hm[1]).split(",").filter(function (i) { return byId(i); }); if (ids.length) state.stack = ids; }
  function save() { try { localStorage.setItem("stackos", JSON.stringify({ stack: state.stack, reg: registry.filter(function (r) { return state.stack.indexOf(r.id) >= 0; }) })); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("show"); }, 1600); }
  function inStack(id) { return state.stack.indexOf(id) >= 0; }
  function toggle(id) { if (inStack(id)) state.stack = state.stack.filter(function (x) { return x !== id; }); else state.stack.push(id); state.stackName = ""; save(); renderAll(); }
  function matches(s) {
    if (state.sector !== "all" && s.sector !== state.sector) return false;
    if ($("fRemote").checked && !s.remote) return false;
    if ($("fOfficial").checked && !s.official) return false;
    if (!state.q) return true;
    var hay = (s.name + " " + s.desc + " " + s.pub + " " + (s.tags || []).join(" ") + " " + s.id).toLowerCase();
    return state.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) >= 0; });
  }
  function card(s) {
    var needsKey = Object.keys(envOf(s)).length > 0;
    var b = [];
    if (s.registry) b.push('<span class="bd reg">registry</span>'); else if (s.official) b.push('<span class="bd off">official</span>'); else b.push('<span class="bd">community</span>');
    if (s.remote) b.push('<span class="bd rem">remote · ' + ({ oauth: "oauth", urlkey: "key", bearer: "token", optional: "no-auth" }[s.remote.auth] || (s.registry ? "auth?" : "no-auth")) + "</span>");
    if (s.local) b.push('<span class="bd loc">local · ' + esc(s.local.cmd) + "</span>");
    if (needsKey) b.push('<span class="bd key">needs key</span>');
    return '<article class="card' + (inStack(s.id) ? " in" : "") + '" data-id="' + esc(s.id) + '"><div class="h"><div><h3>' + esc(s.name) + '</h3><div class="pub">' + esc(s.pub) + '</div></div><button class="add" data-id="' + esc(s.id) + '">' + (inStack(s.id) ? "✓ Added" : "+ Add") + "</button></div><p>" + esc(s.desc) + '</p><div class="badges">' + b.join("") + '</div><div class="f"><a href="' + esc(s.docs) + '" target="_blank" rel="noopener">docs ↗</a><span class="dim small">' + esc((s.tags || []).slice(0, 3).map(function (t) { return "#" + t; }).join(" ")) + "</span></div></article>";
  }
  function renderSectors() {
    var h = '<button class="sec' + (state.sector === "all" ? " active" : "") + '" data-s="all"><span><i>∗</i>All servers</span><span class="n">' + CURATED.length + "</span></button>";
    SECTORS.forEach(function (x) { var n = CURATED.filter(function (s) { return s.sector === x.id; }).length; h += '<button class="sec' + (state.sector === x.id ? " active" : "") + '" data-s="' + x.id + '"><span><i>' + x.icon + "</i>" + x.name + '</span><span class="n">' + n + "</span></button>"; });
    $("sectors").innerHTML = h;
  }
  function renderStacks() {
    $("stacks").innerHTML = STACKS.map(function (st) { return '<button class="stk" data-stack="' + st.id + '"><span class="e">' + st.emoji + "</span><b>" + esc(st.name) + "</b><span>" + esc(st.desc) + '</span><span class="ct">' + st.ids.length + " servers →</span></button>"; }).join("");
  }
  function renderGrid() {
    var list = CURATED.filter(matches);
    $("grid").innerHTML = list.length ? list.map(card).join("") : '<div class="empty dim">No curated servers match. Try <b>⟳ Live scan</b> to search the official registry.</div>';
    var sec = SECTORS.find(function (x) { return x.id === state.sector; });
    $("sectorTitle").textContent = sec ? sec.name : "All servers";
    $("resultCount").textContent = list.length + " of " + CURATED.length;
    if (registry.length) { $("registryBlock").classList.remove("hidden"); $("regGrid").innerHTML = registry.map(card).join(""); }
  }
  var TABS = [["claude", "Claude"], ["chatgpt", "ChatGPT"], ["grok", "Grok"], ["cursor", "Cursor"], ["vscode", "VS Code"], ["env", ".env + README"]];
  var CAVEATS = {
    claude: "Claude Desktop's config file runs local (stdio) servers. Remote servers are wrapped with the mcp-remote bridge (it opens a browser for OAuth). You can also add remote URLs in Claude under Settings → Connectors → Add custom connector.",
    chatgpt: "ChatGPT only supports remote MCP servers (Streamable HTTP / SSE) with OAuth or no auth. Local servers are flagged as unsupported. Full read + write MCP is for Business/Enterprise/Edu; other plans may be limited.",
    grok: "Grok supports remote MCP only (grok.com custom connectors, or the xAI API's Remote MCP Tools). The API doesn't run OAuth for you, so OAuth servers need a token in authorization, or use grok.com connectors instead. Local servers need a public tunnel.",
    cursor: "Cursor handles both local commands and remote URLs (including OAuth). Put this in ~/.cursor/mcp.json (global) or .cursor/mcp.json (project).",
    vscode: "VS Code (Copilot agent mode) reads .vscode/mcp.json. It uses a top-level \"servers\" key, not \"mcpServers\".",
    env: "Placeholders like <API_KEY> appear in the configs. Fill in .env.example to see what you need."
  };
  function currentList() { return state.stack.map(byId).filter(Boolean); }
  function renderStack() {
    var list = currentList();
    $("countBadge").textContent = list.length; $("stackCount").textContent = list.length + " server" + (list.length === 1 ? "" : "s");
    $("stackList").innerHTML = list.map(function (s) { return '<li><span class="m"><span class="bd ' + (s.remote ? "rem" : "loc") + '">' + (s.remote ? "remote" : s.local.cmd) + "</span><span>" + esc(s.name) + '</span></span><button class="rm" data-id="' + esc(s.id) + '" title="Remove">✕</button></li>'; }).join("");
    $("stackEmpty").classList.toggle("hidden", list.length > 0);
    $("exportBox").classList.toggle("hidden", list.length === 0);
    if (!list.length) return;
    $("tabs").innerHTML = TABS.map(function (t) { return '<button class="tab' + (state.tab === t[0] ? " active" : "") + '" data-tab="' + t[0] + '">' + t[1] + "</button>"; }).join("");
    var files = buildFiles(list, state.stackName)[state.tab];
    if (state.file >= files.length) state.file = 0;
    $("fileSel").innerHTML = files.map(function (f, i) { return '<option value="' + i + '"' + (i === state.file ? " selected" : "") + ">" + f.path.split("/").pop() + "</option>"; }).join("");
    $("fileNote").textContent = files[state.file].note;
    $("preview").textContent = files[state.file].content;
    var c = CAVEATS[state.tab];
    if (state.tab === "chatgpt" || state.tab === "grok") { var n = list.filter(function (s) { return !s.remote; }).length; if (n) c += " ⚠ " + n + " server" + (n > 1 ? "s" : "") + " in this stack " + (n > 1 ? "are" : "is") + " local-only."; }
    $("caveat").textContent = c;
  }
  function renderAll() { renderSectors(); renderGrid(); renderStack(); }
  function download(name, blob) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); });
    var t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); toast("Copied to clipboard");
  }

  // registry live scan
  function fromRegistry(item) {
    var s = item.server || item; var name = s.title || s.name.split("/").pop();
    var o = { id: "reg:" + s.name, name: name, sector: "registry", pub: s.name.split("/")[0], official: false, registry: true, desc: (s.description || "").slice(0, 160), docs: s.websiteUrl || (s.repository && s.repository.url) || "https://registry.modelcontextprotocol.io/v0/servers?search=" + encodeURIComponent(s.name), tags: ["registry"] };
    var r = (s.remotes || []).find(function (x) { return /^https:\/\//.test(x.url || "") && !/\{/.test(x.url); });
    if (r) o.remote = { url: r.url, transport: r.type === "sse" ? "sse" : "http", auth: (r.headers && r.headers.length) ? "bearer" : "none", headers: (r.headers || []).map(function (h) { return { name: h.name, value: (h.value || "<" + h.name.toUpperCase().replace(/[^A-Z0-9]/g, "_") + ">").replace(/\{([^}]+)\}/g, function (_, v) { return "<" + v.toUpperCase().replace(/[^A-Z0-9]/g, "_") + ">"; }) }; }), note: (r.headers && r.headers.length) ? "Needs header(s): " + r.headers.map(function (h) { return h.name; }).join(", ") : "Auth unknown: check the docs." };
    var p = (s.packages || []).find(function (x) { return ["npm", "pypi", "oci"].indexOf(x.registryType || x.registry_type) >= 0; });
    if (p) {
      var t = p.registryType || p.registry_type, id = p.identifier || p.name, env = {};
      (p.environmentVariables || p.environment_variables || []).forEach(function (e) { if (e.name) env[e.name] = e.description || e.name; });
      if (t === "npm") o.local = { cmd: "npx", args: ["-y", id + (p.version ? "@" + p.version : "")], env: env };
      else if (t === "pypi") o.local = { cmd: "uvx", args: [id + (p.version ? "==" + p.version : "")], env: env };
      else o.local = { cmd: "docker", args: ["run", "-i", "--rm"].concat(Object.keys(env).reduce(function (a, k) { return a.concat(["-e", k]); }, []), [id]), env: env };
    }
    return o.remote || o.local ? o : null;
  }
  function liveScan() {
    var q = state.q.trim();
    $("registryBlock").classList.remove("hidden"); $("regStatus").textContent = "scanning…"; $("regGrid").innerHTML = "";
    fetch("/api/registry?" + new URLSearchParams({ search: q, limit: "30" })).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (d) {
      var seen = {}, keep = registry.filter(function (r) { return inStack(r.id); });
      var fresh = (d.servers || []).map(fromRegistry).filter(function (x) { if (!x || seen[x.id]) return false; seen[x.id] = 1; return true; });
      registry = keep.concat(fresh.filter(function (f) { return !keep.some(function (k) { return k.id === f.id; }); }));
      $("regStatus").textContent = fresh.length + " found" + (q ? ' for "' + q + '"' : "") + " · live";
      renderGrid();
      if (!fresh.length) $("regGrid").innerHTML = '<div class="empty dim">Nothing in the registry for that query.</div>';
    }).catch(function (e) { $("regStatus").textContent = "registry unreachable (" + e.message + "): the curated catalogue still works"; });
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.classList.contains("add") || t.classList.contains("rm")) toggle(t.dataset.id);
    else if (t.dataset.s) { state.sector = t.dataset.s; renderAll(); }
    else if (t.dataset.stack) { var st = STACKS.find(function (x) { return x.id === t.dataset.stack; }); state.stack = st.ids.slice(); state.stackName = st.name + " stack"; save(); renderAll(); toast("Booted " + st.name + " (" + st.ids.length + ")"); if (innerWidth <= 1180) $("stackPanel").classList.add("open"); }
    else if (t.dataset.tab) { state.tab = t.dataset.tab; state.file = 0; renderStack(); }
  });
  $("fileSel").addEventListener("change", function () { state.file = +this.value; renderStack(); });
  $("q").addEventListener("input", function () { state.q = this.value; renderGrid(); });
  $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") liveScan(); });
  document.addEventListener("keydown", function (e) { if (e.key === "/" && document.activeElement !== $("q")) { e.preventDefault(); $("q").focus(); } if (e.key === "Escape") $("stackPanel").classList.remove("open"); });
  $("fRemote").addEventListener("change", renderGrid); $("fOfficial").addEventListener("change", renderGrid);
  $("scanBtn").addEventListener("click", liveScan);
  $("stackToggle").addEventListener("click", function () { if (innerWidth <= 1180) $("stackPanel").classList.toggle("open"); else $("stackPanel").scrollIntoView({ behavior: "smooth" }); });
  $("closeStack").addEventListener("click", function () { $("stackPanel").classList.remove("open"); });
  $("clearBtn").addEventListener("click", function () { state.stack = []; save(); renderAll(); });
  $("shareBtn").addEventListener("click", function () { var u = location.origin + location.pathname + "#stack=" + encodeURIComponent(state.stack.filter(function (i) { return i.indexOf("reg:") !== 0; }).join(",")); copy(u); });
  function cur() { return buildFiles(currentList(), state.stackName)[state.tab][state.file]; }
  $("copyBtn").addEventListener("click", function () { copy(cur().content); });
  $("dlBtn").addEventListener("click", function () { var f = cur(); download(f.dl || f.path.split("/").pop(), new Blob([f.content], { type: /json$/.test(f.path) ? "application/json" : "text/plain" })); });
  $("zipBtn").addEventListener("click", function () { var g = buildFiles(currentList(), state.stackName), files = []; Object.keys(g).forEach(function (k) { files = files.concat(g[k]); }); download("stackos-" + (state.stackName || "stack").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") + ".zip", zip(files)); toast("Zip downloaded"); });
  renderStacks(); renderAll();
})();
