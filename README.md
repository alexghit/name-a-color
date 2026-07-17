# Name a Color

Enter a hex code, get the name of the closest color to it.

Live at [colors.hey5.studio](https://colors.hey5.studio).

## What it does

`#3A7BD5` doesn't tell you anything. "Fibonacci Blue" does. This takes any hex code and finds the nearest match out of 4,420 curated color names.

Matching happens in CIE Lab space rather than raw RGB, which matters: RGB distance treats all channels equally, so it'll often hand you a name that's mathematically close but looks wrong. Lab is built to approximate how human vision actually perceives difference, so the name you get back is the one that genuinely looks closest.

The whole name list is bundled into the page — no API calls, no network round-trip, no rate limits. Lookups are instant and it works offline.

- **Type anywhere to start** — no clicking into the field first, it focuses itself
- **Paste to replace** — paste over the selected hex and it swaps instantly
- **HEX / RGB / HSL input** — toggle between them; your value carries across the switch, and the pills show the other two formats, click to copy
- **Glow toggle** — turns off the animated background glow, remembered per browser and defaults off if your OS asks for reduced motion

### Shortcuts

| Key | Action |
|---|---|
| `Cmd/Ctrl` + `A` | Select the hex code |
| `Cmd/Ctrl` + `C` | Copy hex if selected, otherwise the color name |
| `Esc` | Clear |

## How it's built

Vanilla HTML/CSS/JS, no framework or build step.

```
index.html   the whole app — markup, CSS, JS and favicon inlined
colors.js    the 4,420-name dataset, kept separate so it caches
             across visits instead of re-downloading with the page
```

`wrangler.toml` serves the repo root and falls back to `index.html` for any unmatched path, so a wrong URL lands on the app rather than a 404.

## Credits

Color names from [color-names](https://github.com/meodai/color-names) by David Aerne, MIT licensed. See `LICENSE-color-names.txt`.

Made with ♥ by Alex Ghit — <alex@hey5.studio>
