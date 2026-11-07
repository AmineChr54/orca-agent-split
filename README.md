# Agent Split

An [Orca](https://github.com/stablyai/orca) plugin: one shortcut splits the terminal you're looking at
and starts your coding agent in the new pane, side by side.

- Two slots, each with its own shortcut and status bar button. By default the first runs `claude` and
  the second runs `codex`. Any command works: `claude --model opus`, `gemini`, a shell alias.
- Splits the focused pane of the project you have selected in Orca, whichever project that is.
- The new pane opens on the right by default. A setting switches it to below.

## Install

**From the community catalog:**

1. In Settings → Plugins → **Add marketplace**, enter the URL
   `https://github.com/stablyai/orca-community-plugins.git` with ref `main`.
2. Find **Agent Split** in the list, install it and approve it.

**From Git:** install from the Git URL `https://github.com/AmineChr54/orca-agent-split`.

**From a local folder** (for hacking on it):

```bash
git clone https://github.com/AmineChr54/orca-agent-split
orca plugin dev load ./orca-agent-split    # prints a fingerprint; re-run with --approve <fingerprint>
```

Orca asks you to approve what the plugin can do:

- Run its own code in a separate Node.js process (it runs Orca's `orca terminal split` CLI)
- Read the name and terminal list of your focused workspace (to find the pane to split)
- Read its own settings
- Take over two rarely used built-in actions, **Show Checks** and **Show Ports** (see below)

## One-time step: bind the shortcuts

Orca ignores plugin shortcuts while a terminal has focus, which is exactly where you'd press
them. Orca's own actions do still fire there. So the plugin takes over two built-in actions,
**Show Checks** and **Show Ports**. You bind those to the keys you want in `~/.orca/keybindings.json`
(on Windows that's `C:\Users\<you>\.orca\keybindings.json`):

```json
{
  "version": 1,
  "keybindings": {
    "sidebar.checks.toggle": ["Mod+Shift+F"],
    "sidebar.ports.toggle": ["Mod+Shift+G"],

    "sidebar.search.toggle": [],
    "sidebar.sourceControl.toggle": []
  }
}
```

`Mod` is Ctrl on Windows and Linux and ⌘ on macOS. The last two lines free Ctrl+Shift+F and
Ctrl+Shift+G, which Orca uses by default for Search and Source Control. If you pick keys nobody
else uses, leave those two lines out. If you already have a `keybindings.json`, merge these lines
into it.

**Then reload it:** Orca reads this file once at startup. Go to Settings → Shortcuts, open the
dropdown next to **Edit File**, and click **Reload from Disk**. Or restart Orca.

Picking keys:

- Avoid Ctrl+Alt+&lt;key&gt; on keyboards with an AltGr key, such as German and many European
  layouts. There Ctrl+Alt+2 types `²`, so Orca sees typing, not a shortcut.
- Check Settings → Shortcuts for clashes before you choose.

Side effect: running **Show Checks** or **Show Ports** from the command palette or a menu now
opens your agent. You can turn the takeover off on the plugin's page in Settings → Plugins.

## Settings

Settings → Plugins → Agent Split:

| Setting                  | Default | What it does                              |
| ------------------------ | ------- | ----------------------------------------- |
| First command            | `claude` | Runs for the Show Checks shortcut         |
| Second command           | `codex`  | Runs for the Show Ports shortcut          |
| Where the new pane opens | Right    | `Right` (side by side) or `Down` (stacked) |

The status bar buttons show the configured commands and work like the shortcuts.

## How it works

The plugin API has no way to split panes, so the worker calls Orca's bundled CLI:

1. `workspace.readContext` gives the terminals of the project focused in Orca.
2. `orca terminal list --include-visual-layouts` gives that project's active tab and active pane.
3. `orca terminal split --terminal <that pane> --direction vertical --command <your command>`

The CLI runs from the filesystem root. Run from inside a project folder, the CLI would pick a
terminal in *that* project instead of the one you're looking at. The worker also fills in
`APPDATA`/`LOCALAPPDATA` on Windows, because Orca starts plugin workers without them and the CLI
needs them to find Orca.

The CLI's path is resolved again on every press, so Orca updates don't break the plugin.

## Troubleshooting

```bash
orca plugin list                # find the plugin's id, e.g. <publisher>.agent-split
orca plugin logs <id>           # every press logs "split <pane> -> <command>" or the error
```

- **Shortcut does nothing:** reload `keybindings.json` (see above), then check that Show Checks
  and Show Ports list your keys in Settings → Shortcuts.
- **Button works, shortcut doesn't:** the key is taken by something else, or on your keyboard
  layout it types a character.

Tested on Windows 11 with Orca 1.4.251. macOS and Linux should work, since the CLI path is
resolved for both, but are untested. Issues and PRs welcome.

## License

MIT
