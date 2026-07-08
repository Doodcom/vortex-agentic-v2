# Project: Vortex Strict Type Safety Enforcement

## Architecture
We are eradicating all `any` type warnings (specifically `@typescript-eslint/no-explicit-any`) across the entire Vortex Agentic V2 TypeScript codebase (comprising 338 occurrences). 
Our strategy involves:
1. **Foundational Types**: Resolving types in `src/types/electron.d.ts` and `src/lib/comfyApi.ts` first, so that downstream components/hooks have concrete type contracts.
2. **Contextual Hooks**: Resolving types in shared hooks (`src/hooks/useComfySocket.ts` and `src/hooks/useOllama.ts`).
3. **Components & Layout**: Updating React components and App layout files systematically using the updated hooks and electron API types.

## Code Layout
- `src/types/electron.d.ts` (Electron IPC window-binding typings)
- `src/lib/comfyApi.ts` (ComfyUI API communications)
- `src/hooks/` (Shared custom React hooks)
- `src/components/` (React application view components)
- `src/App.tsx` (Main application entry point)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Foundational Electron & API Types | Resolve 28 warnings in `src/types/electron.d.ts` and `src/lib/comfyApi.ts` | None | DONE |
| 2 | Core Custom Hooks | Resolve 58 warnings in `src/hooks/useComfySocket.ts` and `src/hooks/useOllama.ts` | M1 | DONE |
| 3 | Core Layout & App Views | Resolve 85 warnings in `src/App.tsx` and main layout components (`AssistantView`, `CleanerView`, `DashboardView`, `HomeView`, `SettingsPage`, `Sidebar`, `StatusBar`, `WindowControls`) | M1, M2 | IN_PROGRESS |
| 4 | System & Process Views | Resolve 56 warnings in system/process/maintenance components (`DiskView`, `DockerComposeBuilderView`, `DockerView`, `BootView`, `MemoryView`, `ProcessView`, `ServiceView`, `SnapshotView`, `StartupView`, `TerminalView`, `UpdatesView`) | M1, M2 | PLANNED |
| 5 | Auxiliary Feature Views | Resolve 111 warnings in remaining components (`AppLauncherView`, `ArtifactView`, `AuditView`, `AutomationsView`, `BenchmarkView`, `CommandPalette`, `CronView`, `EnvView`, `FirewallView`, `GalleryView`, `Header`, `HealthReportView`, `HistoryView`, `ImageView`, `LogAnalysisView`, `LogView`, `NetworkView`, `NotificationCentre`, `OllamaModelsView`, `OptimizerView`, `SandboxView`, `SshView`, `ThemeProvider`, `VideoView`) | M1, M2 | PLANNED |
| 6 | Verification & Final Audit | Run `npm run lint` and `npm run build` to confirm 0 `@typescript-eslint/no-explicit-any` warnings and zero compilation failures. | M1, M2, M3, M4, M5 | PLANNED |

## Interface Contracts
- All IPC methods exposed to the `window.electron` object in `src/types/electron.d.ts` must have explicit argument and return types.
- Prop types for React components in `src/components/` must use concrete interfaces or types rather than implicit/explicit `any`.
- Generic parameters for callbacks and state hooks must be specified explicitly where appropriate.
- `@ts-ignore` or other suppression comments must not be used to bypass the `@typescript-eslint/no-explicit-any` rule.
