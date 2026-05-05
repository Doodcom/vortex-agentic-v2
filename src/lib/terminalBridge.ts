// Module-level singleton so TerminalView can hand off a query to AssistantView
// without prop-drilling through App.tsx

let pending: string | null = null

export function setTerminalQuery(q: string) { pending = q }
export function consumeTerminalQuery(): string | null { const q = pending; pending = null; return q }
