# Vortex Strict Type Safety E2E Test Suite Status (TEST_READY)

This document certifies that the 4-tier E2E testing suite is configured and ready for execution.

---

## How to Invoke the Test Runner

The entire test suite can be run using the standard package scripts:

```bash
# Run the complete test suite (aborts on first failure)
npm run test:e2e

# Run all test tiers even if preceding tiers fail (recommended for local audits)
npm run test:e2e -- --allow-failure
```

---

## Test Tier Coverage Summary

### Tier 1: Lint / Type-Safety Compliance
- **Script**: `tests/check-no-explicit-any.js`
- **Scope**: Matches all `src/**/*.{ts,tsx}` and `electron/**/*.ts` files.
- **Verification**: Overrides the linting rules to treat `@typescript-eslint/no-explicit-any` as an error. Reports full file paths, line numbers, and columns for all violations.

### Tier 2: Production Build Verification
- **Script**: `tests/verify-build.js`
- **Scope**: Verifies compiler (`tsc -b`) and bundler (`vite build`) execution.
- **Verification**: Assures existence of production output artifacts:
  - `dist/index.html`
  - `dist-electron/main.js`
  - `dist-electron/preload.js`

### Tier 3: Electron Process Boot check
- **Script**: `tests/test-boot.js`
- **Scope**: Spawns Electron main process under `--dry-run` and safe flags.
- **Verification**:
- Validates handler registrations without opening any GUI window.
- Automatically wraps command in `xvfb-run` if running headlessly on Linux.
- Detects and fails on any uncaught exceptions or fatal console logs.
- Fails if the process does not print `[Main] Dry-run confirmation: --dry-run detected. Exiting now.`
- Fails if the process fails to exit on its own within the 5-second window (treating timeout as a failure).

### Tier 4: Import Sanity Checks
- **Script**: `tests/import-check.js`
- **Scope**: Scans all source files under `src/` and `electron/` (`.ts`, `.tsx`, `.js`, `.jsx`).
- **Verification**:
- Compiles each file in-memory using `esbuild` with `bundle: true` and `write: false`.
- Automatically maps `@/` aliases to `src/` absolute paths using a resolver plugin.
- Dynamically externalizes all external node modules and Node built-in imports.
- Stub out CSS and assets with an empty export plugin.
- Fails if any imports in the dependency tree are broken or fail to compile.

---

## Current Execution Readiness
- [x] **Tier 1 (Lint Checks)**: Ready (Expected to fail on current codebase containing explicit `any` warnings)
- [x] **Tier 2 (Build Checks)**: Ready (Requires clean compilation)
- [x] **Tier 3 (Boot Checks)**: Ready
- [x] **Tier 4 (Import Checks)**: Ready (Scanning all source files for valid paths)
