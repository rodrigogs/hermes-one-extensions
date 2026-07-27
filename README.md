# Hermes One Extensions

The shared extension bundle for **Hermes One**.

It adds integrated views to the Hermes One shell without forking the WebUI:

- **Hermes One Extension Kit** — host-native panel lifecycle, navigation and theme bridge used by the other extensions;
- **Office 3D** — persistent iframe view for the local `/office/` scene;
- **Profile Router** — operational view for the local profile-routing sidecar;
- **Fact Explorer** — read-only view of the Holographic Memory fact store.

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

The shared shell tests resolve files relative to the `hermes-panel` directory:

```bash
cd hermes-panel
node --test tests/*.js
node --check hermes-panel-nav.js
node --check hermes-theme-bridge.js
```

Validate every extension script after a change:

```bash
node --check capability-router/router-nav.js
node --check memory-graph/memory-nav.js
node --check office-3d-launcher/office-nav.js
```

## Safety

This repository contains browser assets and manifests only. Do not commit
sidecar tokens, profile configuration, credentials, runtime databases or backup
artifacts.

## License

MIT. See [LICENSE](LICENSE).
