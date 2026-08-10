# Hermes One Extensions

The shared extension bundle for **Hermes One**.

It adds integrated views to the Hermes One shell without forking the WebUI:

- **Hermes One Extension Kit** — host-native panel lifecycle, navigation and theme bridge used by the other extensions;
- **Office 3D** — persistent iframe view for the local `/office/` scene;
- **Capability Router** — operational view for the local model-routing sidecar:
  the capability ladder, the blocklist and breaker, and the recorded decisions;
- **Fact Explorer** — read-only view of the Holographic Memory fact store: the
  fact list is the primary surface, with a derived graph as a second mode;
- **Fork Keeper** — whether this install is behind its upstream, and merging it
  in when it is. `hermes update` skips a fork that carries local commits, since
  its upstream sync is fast-forward only.

## Runtime contract

The WebUI loads this directory through:

```text
HERMES_WEBUI_EXTENSION_DIR=/path/to/hermes-one-extensions
HERMES_WEBUI_EXTENSION_MANIFEST=extensions.json
```

The manifest extension IDs are part of the runtime API. Sidecar-backed entries
also use their ID in the same-origin proxy path:

```text
/api/extensions/<extension-id>/sidecar/
```

Do not rename an ID as a file-only change. Follow the migration plan in the
`delegate-profile` repository and validate the manifest, proxy consent, token
and sidecar health together.

**Fork Keeper is the exception to the sidecar path.** It has no sidecar of its
own; it calls three routes the WebUI serves directly:

```text
GET  /api/fork-keeper/status
POST /api/fork-keeper/dry-run
POST /api/fork-keeper/sync
```

Those routes are not part of this repository — they live in the WebUI
(`api/fork_keeper_bridge.py`, dispatched from `api/routes.py`) and shell out to
`hermes sync-fork`. Without them the panel loads and reports "Status
unavailable"; the extension itself is doing nothing wrong at that point. The
panel deliberately never runs git, so the merge policy lives in one place that
the CLI, the cron job and this panel all share.

## Development

Run every suite in the repository from the root:

```bash
npm test
```

The suites resolve their subjects against their own directory, so they also run
from anywhere:

```bash
cd hermes-one-extension-kit
node --test tests/*.js
node --check hermes-panel-nav.js
node --check hermes-theme-bridge.js
```

The `office-panel-tokens.css` sync check needs the office checkout. It is found
as a sibling of this repository; point `OFFICE_TOKENS_CSS` at the file if yours
lives elsewhere.

Validate every extension script after a change:

```bash
node --check hermes-one-capability-router/router-nav.js
node --check hermes-one-fact-explorer/memory-nav.js
node --check hermes-one-office-3d/office-nav.js
```

## Safety

This repository contains browser assets and manifests only. Do not commit
sidecar tokens, profile configuration, credentials, runtime databases or backup
artifacts.

## License

MIT. See [LICENSE](LICENSE).
