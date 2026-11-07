// Agent Split: split the focused Orca terminal and start a command (your coding agent) in the new pane.
// The plugin host API cannot split panes, so this calls Orca's own CLI (`orca terminal split`).
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, parse } from 'node:path'

const SLOTS = {
  'agentSplit.first': { setting: 'firstCommand', fallback: 'claude', statusBarItem: 'first' },
  'agentSplit.second': { setting: 'secondCommand', fallback: 'codex', statusBarItem: 'second' }
}

// Orca starts plugin workers with a trimmed environment. On Windows the CLI needs APPDATA to find
// the running Orca, so rebuild the usual folders from the home directory.
function cliEnv() {
  const env = { ...process.env }
  if (process.platform === 'win32') {
    const home = env.USERPROFILE || homedir()
    env.USERPROFILE ??= home
    env.APPDATA ??= join(home, 'AppData', 'Roaming')
    env.LOCALAPPDATA ??= join(home, 'AppData', 'Local')
  }
  return env
}

// Resolve the CLI fresh on every press, so an Orca update or reinstall never leaves a stale path.
function orcaCli() {
  const exe = process.platform === 'win32' ? 'orca.exe' : 'orca'
  const appDir = dirname(process.execPath)
  const candidates = [
    join(appDir, 'resources', 'bin', exe), // Windows / Linux: <install>/resources/bin
    join(appDir, '..', 'Resources', 'bin', exe), // macOS: Orca.app/Contents/MacOS -> Contents/Resources/bin
    process.platform === 'win32' && join(cliEnv().LOCALAPPDATA, 'Programs', 'orca', 'resources', 'bin', exe)
  ].filter(Boolean)
  return candidates.find((p) => existsSync(p)) ?? 'orca' // last resort: on PATH
}

// Run the CLI from the filesystem root: inside a project folder the CLI scopes "the active
// terminal" to that project instead of the one you have open in Orca.
const NEUTRAL_CWD = parse(homedir()).root

function cli(args) {
  return new Promise((resolve, reject) => {
    execFile(
      orcaCli(),
      [...args, '--json'],
      { timeout: 20000, windowsHide: true, env: cliEnv(), cwd: NEUTRAL_CWD, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        let parsed = null
        try { parsed = JSON.parse(stdout) } catch {}
        if (parsed?.ok) return resolve(parsed.result)
        const reason = parsed?.error?.message || stderr?.trim() || error?.message || 'unknown error'
        reject(new Error(reason))
      }
    )
  })
}

// The visible, focused pane of a project's layout: active tab of a tab group -> its active leaf.
function activePaneHandle(node) {
  if (!node || typeof node !== 'object') return null
  if (node.activeTabId && Array.isArray(node.tabs)) {
    const tab = node.tabs.find((t) => t.tabId === node.activeTabId)
    const handle = tab && findLeaf(tab.panes, tab.activeLeafId)
    if (handle) return handle
  }
  for (const value of Object.values(node)) {
    const handle = activePaneHandle(value)
    if (handle) return handle
  }
  return null
}

function findLeaf(node, leafId) {
  if (!node || typeof node !== 'object') return null
  if (node.type === 'terminal' && node.leafId === leafId && node.handle) return node.handle
  for (const value of Object.values(node)) {
    const handle = findLeaf(value, leafId)
    if (handle) return handle
  }
  return null
}

// The pane to split: the focused pane of the project currently selected in Orca.
async function targetTerminal(orca) {
  const context = await orca.host.call('workspace.readContext').catch(() => null)
  const ids = new Set((context?.terminals ?? []).map((t) => t.id))
  if (ids.size === 0) return null // no focused project: let the CLI choose
  const list = await cli(['terminal', 'list', '--include-visual-layouts'])
  const worktreeId = list.terminals?.find((t) => ids.has(t.handle))?.worktreeId
  const layout = list.visualLayouts?.find((l) => l.worktreeId === worktreeId)
  return (layout && activePaneHandle(layout.root)) ?? [...ids][0]
}

async function readSettings(orca) {
  const settings = await orca.settings.get().catch(() => ({}))
  const command = (slot) => String(settings?.[slot.setting] ?? '').trim() || slot.fallback
  return { command, direction: settings?.direction === 'down' ? 'down' : 'right' }
}

async function split(orca, slot) {
  const { command, direction } = await readSettings(orca)
  const terminal = await targetTerminal(orca)
  // Orca's CLI names the divider: vertical = side by side (new pane right), horizontal = stacked.
  const args = ['terminal', 'split', '--direction', direction === 'down' ? 'horizontal' : 'vertical']
  args.push('--command', command(slot))
  if (terminal) args.push('--terminal', terminal)
  const result = await cli(args)
  return { handle: result?.split?.handle, command: command(slot) }
}

// Show the configured commands on the status bar buttons.
async function refreshStatusBar(orca) {
  const { command, direction } = await readSettings(orca)
  for (const slot of Object.values(SLOTS)) {
    const text = command(slot)
    await orca.host
      .call('statusBar.update', {
        id: slot.statusBarItem,
        text: text.length > 24 ? `${text.slice(0, 23)}…` : text,
        tooltip: `Agent Split: open ${text} in a ${direction === 'down' ? 'lower' : 'right'} split`
      })
      .catch(() => undefined)
  }
}

// Why `replaces`: Orca ignores plugin keybindings while a terminal has focus, but built-in actions
// still fire there. So each command takes over a rarely used built-in (Show Checks / Show Ports)
// and the README binds those to the shortcut keys in ~/.orca/keybindings.json.
// Orca runs its own action if a replacement takes over 2 s, so answer at once and split in the
// background; failures are logged (`orca plugin logs <publisher>.agent-split`).
export default function activate(orca) {
  let busy = false
  for (const [id, slot] of Object.entries(SLOTS)) {
    orca.commands.register(id, () => {
      if (busy) return null // ignore key auto-repeat while a split is starting
      busy = true
      split(orca, slot)
        .then(({ handle, command }) => orca.log(`split ${handle ?? '?'} -> ${command}`))
        .catch((err) => orca.log(`could not open ${slot.setting}: ${err.message}`))
        .finally(() => { busy = false })
      return null
    })
  }
  void refreshStatusBar(orca)
  orca.settings.onDidChange(() => void refreshStatusBar(orca))
}
