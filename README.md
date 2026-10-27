# logcat2kt

Turn raw logcat output into a collapsible JSON tree and Kotlin data classes.

**Live demo: <https://rendonglu.github.io/logcat2kt/>**

English | [简体中文](README.zh-CN.md)

A single-file web page. No dependencies, no network, no upload — logs are processed entirely in your browser.

---

## The problem

Getting from a log copied out of logcat to a usable data class usually takes four mechanical steps:

1. **The log is truncated.** logcat caps a single entry at roughly 4KB, so what you copy out is a pile of fragments, each carrying its own timestamp/pid/tag prefix.
2. **The seams land mid-string.** You delete prefixes line by line and fix up quotes by hand, hoping you did not misalign one.
3. **Even rejoined, it is still one long line.** You need a formatter to expand it — and pasting business data into a third-party site is not something you want to make a habit of.
4. **Then you type the class.** A dozen fields, three or four levels of nesting, every name, nullability marker and type done by eye.

This tool collapses all four into a single paste. During integration work the loop runs ten to twenty times a day; the time saved is modest, the attention saved is not.

---

## Features

Three input formats, auto-detected and tried in order of specificity:

| Input | Example |
|---|---|
| JSON | `{"code":0,"data":{...}}` |
| Kotlin / Java `toString` | `Response(code=0, data=Data(id=1))` |
| Protocol Buffer | TextFormat (`id: 1`, `user { }`) and binary hex dumps |

Pipeline:

```
parse lines (strip prefixes / detect tag)
  → merge entries (bracket balancing, rejoins truncated multi-line logs)
  → detect structure (toString / TextFormat / JSON / hex, tried in that order)
  → lenient parse (single quotes, unquoted keys, trailing commas, comments…)
  → collapsible tree + type inference + Kotlin generation
```

A few deliberate decisions:

- **Group by tag.** A screenful of logs can mix five or six endpoints; merging them all yields one giant class where every field is nullable and every type is polluted by its neighbours. Each tag gets its own set, prefixed with the tag name.
- **Nullable by default, with `= null`.** Missing fields do not crash, unexpected fields do not crash.
- **Flat output.** All classes are emitted side by side, ready for Gson / kotlinx.serialization / Moshi.
- **Dropped segments are reported, not swallowed.** When the status bar says `N gap(s) skipped`, the system discarded a chunk of the log. Structure across the gap is realigned automatically, but the fields inside it are genuinely gone.

---

## Usage

Open <https://rendonglu.github.io/logcat2kt/>, or double-click `index.html` locally.

1. Select and copy from logcat — multi-select is fine, unrelated lines in between are fine.
2. Paste into the left pane.
3. Read the tree on the right, click `▾` to collapse, switch to the Kotlin tab and copy.

Options:

| Option | Description |
|---|---|
| Root class name | Top-level class name, `Response` by default; tag prefixes are added when there are several groups |
| Annotations | None / Gson / kotlinx.serialization / Moshi |
| Nullability | All nullable (recommended) / infer from sample / all non-null |
| Naming | camelCase / keep as-is |
| Long for timestamps | Integer fields whose names look like timestamps are promoted to `Long` |

Opening `index.html#kotlin` lands directly on the Kotlin tab — worth bookmarking.

---

## Development

There is no build step. Edit `index.html`, reload, done. Tests run on Node with a minimal DOM mock, so they execute the same scripts the page does:

```bash
node test.js
# ===== 86 passed, 0 failed =====
```

`samples/long-text.log` is a real capture that reproduces the dropped-segment case; use it as a regression sample when touching the parser.

The parser and generator are pure functions with zero DOM dependencies. To port this to a CLI, an Android Studio plugin, or CI, take `parseLog / extractNodes / parseLoose / parseProtoText / decodeHexDump / typeOf / genKotlin` as-is.

---

## Design notes

Why it is built this way, and the traps hit along the way — prefix formats, truncation reassembly, dropped segments, 19-digit number precision, naming collisions, protobuf binary decoding — all in [docs/design.md](docs/design.md) (Chinese).

## License

MIT
