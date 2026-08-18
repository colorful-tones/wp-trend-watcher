# Report Themes

Generated report pages support selectable visual themes and color modes. The theme is applied to both the report index and individual reports, and the selected values are saved in `localStorage`.

The current styles are:

- **Civic Brutalist** — Bricolage Grotesque and IBM Plex Mono; the default.
- **Ink Editorial** — Instrument Serif and Space Grotesk; warm magazine-like reading.
- **Neon Observatory** — Syne and DM Mono; dark signal-dashboard energy.

Each style has dedicated light, dark, and system-mode tokens. Google Fonts are loaded by the generated page so the styles remain self-contained in the static report output.

All styles share the same editorial report shell: the index uses an archive-and-card layout, while individual reports use a hero, issue rail, table of contents, and focused reading column. The shell is presentation-only; canonical Markdown sections and source references remain unchanged.

Heading sizes, line heights, and letter-spacing are calibrated per display face rather than shared globally, so the wide geometric, serif, and compact display fonts retain their intended rhythm.

The surface language is also intentionally different: Civic Brutalist uses hard offset shadows and decisive borders, Ink Editorial stays airy with hairline rules and no card shadows, and Neon Observatory uses rounded surfaces with restrained glow shadows.

The current theme system is defined in:

- `src/summarize/html.ts` — theme names, selector options, and the small pre-paint persistence script.
- `src/summarize/report.css` — theme tokens and visual styles.
- `reports/` — generated HTML and copied CSS. Do not edit these files directly; regenerate them instead.

## Add a theme

Use a short lowercase identifier for the stored value. For example, a theme named `forest` uses the value `forest` everywhere.

### 1. Add the option in the generated controls

In `src/summarize/html.ts`, add an option to `REPORT_THEME_CONTROLS`:

```html
<option value="forest">Forest</option>
```

### 2. Add the identifier to the persistence allow-list

In `REPORT_THEME_SCRIPT`, add the same identifier to the `themes` array:

```js
var themes = ["civic-brutalist", "ink-editorial", "neon-observatory", "forest"];
```

The allow-list is intentional: values loaded from `localStorage` must be known themes before they are applied to the document.

### 3. Define the light-mode tokens

Add a selector to `src/summarize/report.css`:

```css
:root[data-theme="forest"] {
  --accent: #176b4d;
  --theme-gradient: radial-gradient(
    circle at 12% 0%,
    rgba(110, 231, 183, 0.24),
    transparent 42%
  );
  --theme-grid-x: none;
  --theme-grid-y: none;
}
```

Themes inherit the base light-mode surface, text, border, and muted colors unless they override those variables. The main theme-specific variables are:

- `--accent` — links, card borders, labels, and focus outlines.
- `--theme-gradient` — the broad background effect.
- `--theme-grid-x` and `--theme-grid-y` — optional repeating grid layers.

Keep the effect subtle enough that report content remains the visual priority.

### 4. Define the dark-mode tokens

Add a dark selector with a readable accent and a darker gradient:

```css
:root[data-theme="forest"][data-mode="dark"] {
  --accent: #75e0b0;
  --theme-gradient: radial-gradient(
    circle at 12% 0%,
    rgba(16, 128, 88, 0.28),
    transparent 42%
  );
}
```

### 5. Define the System-mode dark variant

`system` follows the user's operating-system preference through the existing `@media (prefers-color-scheme: dark)` block. Add the matching selector there too:

```css
:root[data-theme="forest"][data-mode="system"] {
  --accent: #75e0b0;
  --theme-gradient: radial-gradient(
    circle at 12% 0%,
    rgba(16, 128, 88, 0.28),
    transparent 42%
  );
}
```

Without this selector, the new theme will fall back to its light-mode appearance when Mode is set to System and the user's system is dark.

## Regenerate and verify

From the repository root:

```bash
pnpm run regen-html
pnpm run test
pnpm run typecheck
git diff --check
```

`regen-html` updates every report page and `reports/index.html`, and copies the shared stylesheet to `reports/assets/report.css`. Confirm the new option appears on both the index and an individual report.

For a quick browser check, serve the generated reports locally:

```bash
pnpm watch
```

Then open <http://127.0.0.1:3000/index.html> and check the new theme in Light, Dark, and System modes. Stop the watcher with `Ctrl-C` when finished.

## Accessibility checklist

Before keeping a new theme:

- Check body text and muted text against both light and dark surfaces.
- Check links, card labels, and focus outlines against their backgrounds.
- Keep the gradient and pattern low-contrast so it does not compete with report content.
- Test narrow screens; the controls stack on viewports below 560px.
- Preserve the existing `data-theme` and `data-mode` attribute pattern so persistence and no-flash initialization continue to work.
