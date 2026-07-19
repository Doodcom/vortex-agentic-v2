# Packaging

## PKGBUILD (`packaging/PKGBUILD`)

Arch package `vortex-agentic-v2`, built from the local repo checkout
(`git+file://` source — packages committed state only). `cd packaging && makepkg -si`.

- **build()**: `npm ci --legacy-peer-deps` → `npm run build` → `electron-builder --linux dir`
- **package()** installs:
  - app payload from `release/linux-unpacked` → `/opt/vortex-agentic-v2/`
  - launcher script → `/usr/bin/vortex-agentic-v2` (carries the Wayland/GPU flags:
    ozone auto, VaapiVideoDecodeLinuxGL, EGL, GPU rasterization)
  - desktop entry `packaging/vortex-agentic-v2.desktop` → `/usr/share/applications/`
  - icon `public/favicon.svg` → hicolor scalable as `vortex-agentic`
  - polkit rule → `/etc/polkit-1/rules.d/49-vortex-agentic.rules`
  - MCP server `scripts/vortex-mcp.mjs` → `/opt/vortex-agentic-v2/`
- **depends**: nss, libxtst, libxss, gtk3, mesa, alsa-lib
- **optdepends**: ollama, fwupd, snapper, ufw, paru, pacman-contrib

## Desktop entry (`packaging/vortex-agentic-v2.desktop`)

Launches the `/usr/bin/vortex-agentic-v2` wrapper; icon `vortex-agentic`;
categories Utility/System; `StartupWMClass=Vortex Agentic V2`.

## Polkit rule (`resources/polkit/49-vortex-agentic.rules`)

Grants `AUTH_ADMIN_KEEP` on `org.freedesktop.policykit.exec` for wheel users:
chained pkexec maintenance actions (upgrade → snapshot → cleanup) ask for the
password once (~5 min window) instead of once per command. Standalone install:
`sudo bash scripts/install-polkit.sh` (idempotent, copies with mode 0644).

## Relationship to electron-builder targets

`npm run build:electron` (electron-builder) still produces the AppImage and a
`.pacman` artifact in `release/`. The PKGBUILD is the pacman-native alternative:
tracked by the package manager, rebuildable from source, and it carries the
polkit rule + MCP server that the electron-builder targets do not install.
