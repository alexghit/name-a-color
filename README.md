# Name a Color

Enter a hex code, get a color name. No API calls — the name list is bundled and matched locally in CIE Lab space.

Live: https://colors.hey5.studio

## Features

- Type any hex character anywhere on the page to start — the field focuses automatically.
- Paste over the selected hex to replace it instantly.
- Glow toggle (top-right) turns off the animated background glow for reduced-motion / accessibility. Remembered per browser; defaults off if the OS has reduced-motion enabled.

### Shortcuts

| Key | Action |
|---|---|
| `Cmd/Ctrl` + `A` | Select the hex code |
| `Cmd/Ctrl` + `C` | Copy hex if selected, otherwise the color name |
| `Esc` | Clear |

## Files

| File | Purpose |
|---|---|
| `index.html` | Markup |
| `style.css` | Styles |
| `script.js` | Lab conversion + nearest-name lookup |
| `colors.js` | 4,420 curated names (1–2 words) |
| `_headers` | Cloudflare cache/security headers |
| `favicon.ico` `favicon.svg` | Browser tab icons |
| `apple-touch-icon.png` | iOS home screen (180×180) |
| `icon-192.png` `icon-512.png` `icon-512-maskable.png` | PWA icons |
| `site.webmanifest` | PWA manifest |

`preview.html` is a single-file build for local testing. Not deployed.

## Deploy

Static site, no build step.

Cloudflare Pages → connect repo → build command empty, output directory `/`.

## Credits

Color names from [color-names](https://github.com/meodai/color-names) by David Aerne, MIT licensed. See `LICENSE-color-names.txt`.

Built by Alex Ghit — alex@hey5.studio

