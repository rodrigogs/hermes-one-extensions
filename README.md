# Hermes One Extensions

The shared extension bundle for **Hermes One**.

It adds integrated views to the Hermes One shell without forking the WebUI:

- **Hermes One Extension Kit** — host-native panel lifecycle, navigation and theme bridge used by the other extensions;
- **Office 3D** — persistent iframe view for the local `/office/` scene;
- **Capability Router** — operational view for the local model-routing sidecar:
  the capability ladder, the blocklist and breaker, and the recorded decisions;
- **Fact Explorer** — read-only view of the Holographic Memory fact store: the
  fact list is the primary surface, with a derived graph as a second mode.

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
