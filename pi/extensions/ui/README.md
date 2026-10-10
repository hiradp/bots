# UI

The UI uses Pi's built-in welcome header, loaded-resource display, and `light` and `dark` themes (`light/dark` in `settings.json`). Every color comes from the active theme's tokens.

The prompt uses a thin muted frame and an accent-colored `λ`. Bash input changes the marker to the theme's bash-mode color; thinking level is shown in the footer rather than coloring the whole frame. Pi still handles editing, autocomplete, paste, and app shortcuts.

The footer groups project/git and model/thinking on its first row, with context usage and quota/cost on its second, each group in `❬ ❭` brackets like the starship prompt. Narrow terminals compact optional details and wrap groups rather than dropping the right side. Session names and delegated cost breakdowns appear when space permits. Context retains the existing headroom scale: 80% actual usage displays as 100%.

Keep `quietStartup: false` to show Pi's startup display.
