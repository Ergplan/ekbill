# Design rules for agents working on EkBill UI

Read `design/README.md` and `design/components.md` before touching any screen. These rules are not optional.

## Always

- **Tokens only.** Every colour, gradient, shadow, radius, size and font comes from `design/tokens/themes.css` (`var(--eb-…)`) or `tokens.ts`. No hex codes, rgba() or px radii in components. If a value is missing, add it to `tokens/tokens.json`, run `python3 design/tokens/build.py`, and use the new variable.
- **Both themes.** Every component must render correctly with `data-theme="narangi"` and `data-theme="harmony"`. Check both before you finish. A component that only works in one theme is a bug.
- **Strings from the dictionary.** All UI text comes from `design/copy/*.json` by key. Add a key to `copy/strings.json` (both `hi-Latn` and `en`), then regenerate the per-language files. Hinglish is the default.
- **Match the reference.** Compare your screen with `design/screens/<theme>/<screen>.png` at 390px width. Same hierarchy, spacing and order of elements.
- **Mobile first.** Design at 390px. Touch targets ≥ 44px. Nothing scrolls sideways.
- **Money** is integer paise in code. Format with Indian grouping (`₹1,12,400`) and `font-variant-numeric: tabular-nums` (`.eb-num`). Hero amounts use regular Urbanist; no dot-matrix or display fonts.
- **Accessibility.** Real `<button>`, `<a>`, `<input>` with `<label>`. `aria-label` on icon-only buttons. Status is a word plus colour, never colour alone. Text on gradients meets 4.5:1 (3:1 at 24px+).

## Never

- Put Hinglish, gradients, glass or theme colours on the **invoice/PDF**. It is always white paper, `--eb-invoice-ink`, formal English (`invoice.*` keys).
- Use `--eb-whatsapp` anywhere except the WhatsApp send button.
- Use the accent (`--eb-accent`) for anything but the one primary action, the active tab/segment and paid confirmations.
- Add anything to Home beyond the three cards: client chips, bills sent, money to collect.
- Show the GST tab or `/gst` route when `profile.gstin` is empty.
- Introduce schedulers, "periods", "returns" or other concepts the owner didn't bring.
- Load fonts from Google at runtime. Use `design/tokens/fonts.css`.

## Theme-specific structure (the only non-token differences)

| Slot | Narangi | Harmony |
|---|---|---|
| `HeroPanel` | Gradient card (`--eb-g-hero`) + 3 white wave lines | `FolderPanel`: back plate (`--eb-g-hero-back`), 2–3 peeking glass bills, tabbed front (`--eb-g-hero`) |
| `PrimaryCTA` | Accent pill, ink text, ink disc with accent arrow | Glow pill (`--eb-g-cta`), white text, no disc |
| `AgeingIndicator` | Dotted baseline with arcs and dots | Solid/dotted slider with ▼ marker |
| Headline emphasis | Weight 600 | Weight 500 + `--eb-g-headline-emphasis` text gradient |

Branch on `data-theme` (or `useTheme()`) only inside these four components. Everything else is token-driven.

## Before you say a UI task is done

1. Rendered in both themes at 390px.
2. No hard-coded colours (`grep -nE "#[0-9a-fA-F]{3,8}|rgba?\(" src/components`) outside `design/`.
3. All strings are dictionary keys; English toggle works.
4. Compared against the reference PNG.
