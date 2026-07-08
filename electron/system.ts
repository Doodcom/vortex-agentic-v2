/* eslint-disable @typescript-eslint/no-explicit-any */
import { setupMediaHandlers } from './system-media'
import { setupHardwareHandlers } from './system-hardware'
import { setupMaintenanceHandlers } from './system-maintenance'
import { setupPackagesHandlers } from './system-packages'
import { setupBtrfsHandlers } from './system-btrfs'
import { setupDockerHandlers } from './system-docker'
import { setupAiHandlers } from './system-ai'
import { setupDesktopHandlers } from './system-desktop'
import { setupSecurityHandlers } from './system-security'

export function setupSystemHandlers(win: any) {
  setupMediaHandlers(win)
  setupHardwareHandlers(win)
  setupMaintenanceHandlers(win)
  setupPackagesHandlers(win)
  setupBtrfsHandlers(win)
  setupDockerHandlers(win)
  setupAiHandlers(win)
  setupDesktopHandlers(win)
  setupSecurityHandlers(win)
}

export { runGameModeToggle } from './system-ai'
