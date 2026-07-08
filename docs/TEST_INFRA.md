# Vortex Strict Type Safety E2E Testing Infrastructure

This document outlines the testing architecture, onboarding/prerequisites, testing levels (Tiers 1-4), and mocking/stubbing strategies for the Vortex Strict Type Safety Enforcement project.

---

## 1. Testing Architecture Overview
To guarantee the strict type safety and execution integrity of the Vortex Agentic desktop application without relying on external services or network access, we have established a **4-Tier E2E and Sanity Testing Suite**. 

This suite ensures that:
1. No explicit `any` types slip into the source code (`src/` and `electron/` folders).
2. The application compiles and bundles successfully under production configurations.
3. The compiled Electron bundle boots up correctly and shuts down cleanly (in-engine dry run).
4. Imports and component dependency graphs resolve successfully without dangling modules.

```
+--------------------------------------------------------------+
|                  Test Runner (run-all.js)                    |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| Tier 1: ESLint Type Safety Check (check-no-explicit-any.js)  |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| Tier 2: Build Compilation Check (verify-build.js)            |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| Tier 3: Electron Dry-Run Boot Check (test-boot.js)           |
+--------------------------------------------------------------+
                               |
                               v
+--------------------------------------------------------------+
| Tier 4: In-Memory TS Import Check (import-check.js)          |
+--------------------------------------------------------------+
```

---

## 2. Onboarding & Prerequisites

To run the testing suite locally:
- **Node.js**: `v20.x` or later (current environment is running `v26.1.0`).
- **Dependencies**: Install all project dependencies including `esbuild` using:
  ```bash
  npm install
  ```
- **Xvfb (X Virtual Framebuffer)**: Optional, but highly recommended for headless Linux CI/CD environments. The test bootrunner (`test-boot.js`) automatically detects headless environments and leverages `xvfb-run` to run Electron window tests if available.

---

## 3. Testing Levels

### Tier 1: ESLint Type Safety Compliance (`check-no-explicit-any.js`)
- **Objective**: Prevent the inclusion of explicit `any` types in files matching `src/**/*.{ts,tsx}` and `electron/**/*.ts`.
- **Implementation**: Runs ESLint programmatically, overriding configuration rules to turn `@typescript-eslint/no-explicit-any` into an error using the `--rule` CLI option. Outputs the results as JSON, parses them, logs violation locations (file, line, column), and exits with `1` if violations are found.

### Tier 2: Build Verification (`verify-build.js`)
- **Objective**: Confirm the production build compiles without syntax or bundler failures.
- **Implementation**: Executes `npm run build` (which compiles TypeScript definitions with `tsc -b` and bundles the frontend with Vite). Verifies that critical assets are successfully generated at:
  - `dist/index.html` (Frontend Bundle Entry)
  - `dist-electron/main.js` (Electron Main Thread)
  - `dist-electron/preload.js` (Electron Context Isolation Preload)

### Tier 3: Electron Dry-Run Boot (`test-boot.js`)
- **Objective**: Verify that the built application starts correctly, boots the main process, loads necessary handlers (database, Ollama, system information, RAG, etc.), and does not throw uncaught errors.
- **Implementation**: Launches Electron pointing to `dist-electron/main.js` with the `--dry-run` parameter alongside sandbox and hardware acceleration disablement flags (`--no-sandbox`, `--disable-gpu`, `--disable-software-rasterizer`, `--disable-dev-shm-usage`).
- **Dry-Run Interception**: Inside `electron/main.ts`, the `--dry-run` CLI argument is intercepted immediately upon app readiness to perform a safe, headless exit:
  ```typescript
  app.whenReady().then(async () => {
    if (process.argv.includes('--dry-run')) {
      console.log('[Main] Dry-run confirmation: --dry-run detected. Exiting now.');
      app.quit()
      return
    }
    // ... normal window creation
  })
  ```
- **Liveness & Error Trapping**: The test script traps standard error/output to fail immediately on "uncaught exception" or "fatal error". It also verifies that the process outputs the dry-run confirmation log `[Main] Dry-run confirmation: --dry-run detected. Exiting now.`. If the process stalls (fails to exit on its own within 5000ms), it is treated as a **failure**.

### Tier 4: TS Import Resolution Check (`import-check.js`)
- **Objective**: Ensure all relative and library imports across the entire source graph are valid and resolve correctly.
- **Implementation**: Scans `src/App.tsx`, `src/main.tsx`, `electron/main.ts`, `electron/preload.ts`, and recursively all files in `src/components/` and `src/hooks/`. It configures `esbuild` to build each file in-memory (`bundle: true`, `write: false`), marking all external npm packages and Node.js built-in modules as external. It resolves Vite's `@/` paths to absolute paths, and stubs out CSS/assets with an empty export plugin. If any local import fails to resolve or compile, the check fails.

---

## 4. Mocking & Stubbing Strategies

To avoid network requests or local filesystem bloat when bundling and checking files:
- **External Dependency Mocking**: All third-party node packages (e.g. `electron`, `better-sqlite3`, `systeminformation`, `react`, `react-dom`, `axios`, etc.) and Node builtins (e.g. `fs`, `path`, `os`, `child_process`) are declared as `external` to `esbuild`. This prevents resolving node_modules during import checks, focusing the validation purely on internal source file mappings.
- **Asset Stubbing**: Since stylesheets and image assets cannot be loaded directly as standard JavaScript by the compiler, the `import-check.js` script implements an in-memory `asset-stub` plugin for `esbuild`:
  ```javascript
  const assetStubPlugin = {
    name: 'asset-stub',
    setup(build) {
      build.onResolve({ filter: /\.(css|svg|png|jpg|jpeg|gif|webp|woff|woff2|eot|ttf|otf|less|scss|html|ico)$/ }, args => ({
        path: args.path,
        namespace: 'asset-stub-namespace'
      }));
      build.onLoad({ filter: /.*/, namespace: 'asset-stub-namespace' }, () => ({
        contents: 'export default {};',
        loader: 'js'
      }));
    }
  };
  ```
  This stubs all asset imports with an empty default export (`export default {}`), allowing compilation to proceed smoothly.
