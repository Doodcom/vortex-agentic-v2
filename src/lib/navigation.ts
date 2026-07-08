import {
  LayoutDashboard, Zap, Trash2, Rocket,
  Package, MessageSquare,
  Terminal as TerminalIcon, Settings, Server, Activity, Wifi,
  Clock, HardDrive, ShieldCheck, ScrollText, Power, Sparkles, Video, Box, Layers,
  Library, Brain, Home, Cpu, Shield, BotMessageSquare, Camera, LineChart, GitBranch, CalendarClock, KeyRound, FlameKindling, Gauge, Archive, Variable, AppWindow, HeartPulse
} from 'lucide-react'

export interface NavItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string; size?: number; style?: React.CSSProperties }>
}

export interface NavCategory {
  label: string
  items: NavItem[]
}

export const navCategories: NavCategory[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard',   label: 'Dashboard',       icon: LayoutDashboard },
      { id: 'home',        label: 'Home Assistant',  icon: Home },
      { id: 'app-launcher',label: 'App Launcher',    icon: AppWindow },
    ]
  },
  {
    label: 'AI Suite',
    items: [
      { id: 'assistant', label: 'Quantum AI', icon: MessageSquare },
      { id: 'image-gen', label: 'Image Gen',     icon: Sparkles },
      { id: 'video-gen', label: 'Video Gen',     icon: Video },
      { id: 'gallery',   label: 'AI Gallery',   icon: Library },
      { id: 'memory',    label: 'AI Memory',    icon: Brain },
      { id: 'ai-models', label: 'AI Models',    icon: BotMessageSquare },
    ]
  },
  {
    label: 'Performance',
    items: [
      { id: 'optimizer', label: 'Optimizer', icon: Rocket },
      { id: 'scheduler', label: 'Scheduler',    icon: Cpu },
      { id: 'updates', label: 'Updates', icon: Zap },
      { id: 'cleaner',   label: 'Cleaner',         icon: Trash2 },
      { id: 'snapshots', label: 'Restore Points',   icon: Camera },
      { id: 'benchmark', label: 'Benchmark',         icon: Gauge },
      { id: 'sandbox',   label: 'Sandbox',          icon: Shield },
    ]
  },
  {
    label: 'System',
    items: [
      { id: 'terminal', label: 'Terminal', icon: TerminalIcon },
      { id: 'processes', label: 'Processes', icon: Activity },
      { id: 'services',  label: 'Services',  icon: Server },
      { id: 'packages', label: 'Packages', icon: Package },
      { id: 'depgraph', label: 'Dep Graph', icon: Layers },
      { id: 'docker',    label: 'Docker',      icon: Box },
      { id: 'compose-builder', label: 'Compose Builder', icon: Layers },
    ]
  },
  {
    label: 'Diagnostics',
    items: [
      { id: 'network',   label: 'Network',   icon: Wifi },
      { id: 'disk',      label: 'Disk Monitor',  icon: HardDrive },
      { id: 'boot',      label: 'Boot Analyser', icon: Clock },
      { id: 'history',   label: 'Sys History',   icon: LineChart },
      { id: 'health',    label: 'Health Report', icon: HeartPulse },
      { id: 'log-analysis', label: 'AI Log Advisor', icon: BotMessageSquare },
      { id: 'audit',     label: 'Audit Log',     icon: ShieldCheck },
      { id: 'env',       label: 'Env Variables', icon: Variable },
      { id: 'logs',      label: 'Log Viewer',    icon: ScrollText },
      { id: 'startup',   label: 'Startup Apps',  icon: Power },
    ]
  },
  {
    label: 'Automation',
    items: [
      { id: 'automations', label: 'Workflows', icon: GitBranch },
      { id: 'cron', label: 'Cron Jobs', icon: CalendarClock },
      { id: 'ssh', label: 'SSH Keys', icon: KeyRound },
      { id: 'firewall', label: 'Firewall (UFW)', icon: FlameKindling },
      { id: 'vault', label: 'Dotfile Vault', icon: Archive },
    ]
  },
  {
    label: 'Config',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings },
    ]
  }
]

export const navItems = navCategories.flatMap(c => c.items)
