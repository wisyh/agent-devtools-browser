# DeepSeek Harness Desktop

The repository is a DSH bundle as well as an npm/MCP package. It has a Host row and no Client half, so there is no sidebar entry.

## Install

In a DSH session:

```text
plugin_manager install_bundle  target = <absolute path to this repository>
```

If you previously installed `@local/dsh-devtools-browser`, disable that plugin/bundle first; both register `browser` and `browser_devtools`.

Restart DSH Desktop once after installation so the Host half and the skill catalog reload.

## Use

The plugin registers:

- tools `browser` and `browser_devtools`
- skill `agent-devtools-browser`

Ask the model to use the browser, or load the skill. The first call:

```text
browser { action: "open", url: "http://localhost:5173" }
```

DSH launches Edge/Chrome in a separate window with the real DevTools open, and connects over CDP.

## Uninstall

```text
plugin_manager remove_bundle  target = agent-devtools-browser
```
