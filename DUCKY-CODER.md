# Ducky Coder

Full rebrand fork of ZCode (`zai-org/ZCode` v3.14.3) with sign-in removed (guest mode).
Upstream repo: https://github.com/TS-66/theducksdev (branch `ducky-coder`).

Logo: pixel duck (`public/ducky-logo.png`, `packages/web/public/ducky-logo.png`,
`packages/ui/src/assets/ducky-logo.png`).

## What was renamed

- Display: `ZCode` -> `Ducky Coder` (titles, copy, productName, docs).
- Code: `ZCode*` -> `Ducky*`, `Zcode*` -> `Ducky*` (`@ducky/*` scopes,
  `useDuckyStore`, `DuckyAboutLogo`, ...).
- Lowercase: `zcode` -> `ducky` (imports, CLI, scripts, CSS vars).
- Env: `ZCODE_*` -> `DUCKY_*` (`DUCKY_SERVER_HOST`, `DUCKY_WEB_STATIC_ROOT`,
  `DUCKY_SERVER_WORKSPACE`, `DUCKY_SERVER_AUTH_TOKEN`, ...).
  **Breaking:** old `ZCODE_*` names are not read anymore; update `.env` files.
- Deep-link scheme: `zcode://` -> `ducky://` (desktop file, MIME, protocol client).
- Paths: `apps/ducky-cli`, `packages/ducky-cua`, `packages/ducky-server-cli`,
  `*/ducky-protocol*/`, `scripts/build-ducky.mjs`, `scripts/ducky-distribution/`,
  `config/provider/ducky-builtin.json`, `packages/ui/src/components/ui/DuckyAboutLogo.tsx`, ...
- Repo links now point at `TS-66/theducksdev`.

## Intentionally NOT renamed (compat)

- Wire protocol: `zcode-hello` / `zcode-hello-ack`, version constants' values.
- HTTP: `x-ducky-*`? No — `x-zcode-*` headers, `zcode_lite_token` cookie,
  `zcodejwttoken` key, `application/x-zcode-session` MIME.
- Storage: `zcode-theme` / `zcode-locale` localStorage, `data-zcode-*` attrs,
  `.zcode-*` CSS classes, `--zcode-*` CSS vars, `__zcode*` globals.
- Data dirs: `~/.ducky`? No — stays `~/.zcode`, `.zcode-share*`, `.zcode-plugin`
  (existing user data keeps working).
- App IDs: `dev.zcode.app*`, `dev.zcode.cua-helper*`, `cn.aminer.zcode`
  (code-signing, updates, OS registrations).
- URLs: `zcode.z.ai`, `cdn-zcode.z.ai`, `dev@zcode.z.ai` (server-owned).
- Agent bundles: `zcode.cjs`, `zcode-server.cjs` (remote-deploy hash sync).
- `pnpm-lock.yaml` is regenerated via `pnpm install` (never hand-edited);
  `patches/*` untouched (must match upstream file content).

## Guest mode (sign-in removed)

- Deleted: `packages/ui/src/WelcomeScreen.tsx`, `packages/ui/src/login/`,
  `packages/ui/src/hooks/useOAuth.ts`, `useRootOAuthEffects`,
  `useProviderAvailabilityLoginEntryGuard`, `useTokenRefresh`,
  `zcodeJwtInvalidRestartMarker`, `oauthCachedSessionRestore`,
  `oauthLoginAttemptGuard`, `useAccountConnectionLossNotification`,
  `packages/web/src/auth/` (7 files).
- `Root.tsx`: no welcome gate, no OAuth effects (keeps `notifyRendererReady`),
  provider login guard disabled, workspace restore never waits on auth.
- Services: `createOAuthService` returns a signed-out stub (`getProviders()->[]`,
  restores -> `null` / `{signed-out}`, starts throw, logout/poll no-op).
  `credentialService` untouched (API keys still work).
- Server: `providerProvisioningTargetEnabled: false`; lite deployment token
  (`DUCKY_SERVER_AUTH_TOKEN`) kept.
- Desktop: OAuth deep-link branch removed (`ducky://` kept for
  workspace-open/share-import/payment); `registerOAuthState`/`onOAuthCallback`
  removed from `IPlatformService`, preload, renderer, `window.ducky` types.
- Degraded without identity: private share import (public shares work),
  marketplace publish, usage/plan badges + upgrade CTAs, provider provisioning
  (local providers + manual API keys unaffected).

## Install (curl, no token) and releases

End users install the public build without any account or token:

```sh
curl -fsSL https://raw.githubusercontent.com/TS-66/theducksdev/main/install.sh | bash
```

- Root `install.sh`: resolves latest `v*` tag via the public GitHub API,
  downloads `ducky-<version>.tar.gz` + `sha256.txt` from the GitHub Release,
  verifies, extracts to `~/.zcode/runtime/releases/<version>`, links `current`,
  writes `~/.local/bin/ducky`. Env overrides: `DUCKY_VERSION`, `DUCKY_REPO`,
  `DUCKY_DIST_HOME`, `DUCKY_DIST_BIN_DIR`.
- `.github/workflows/release-ducky.yml`: on tag `v*`, builds via
  `node scripts/build-ducky.mjs` and attaches tarball + checksum to the release.
- Publish: `git tag v3.14.3 && git push origin v3.14.3` (after green CI).

## `ducky web` (prod launcher, from source)

```sh
./bin/ducky web --build   # first time: builds web + server, serves, opens browser
./bin/ducky web           # reuse dist
./bin/ducky web --port 3030 --workspace /path/to/project
./bin/ducky web --no-open --skip-build
pnpm ducky web --build
./bin/ducky install       # symlink ~/.local/bin/ducky
```

Serves `packages/web/dist` through `packages/server/dist/entry-http.js`
(SPA fallback) with `DUCKY_WEB_STATIC_ROOT`, waits for `/api/server-info`,
then opens the browser.

## Verify

```sh
pnpm install               # regenerate lockfile after rename
pnpm typecheck && pnpm lint
./bin/ducky web --build
```
