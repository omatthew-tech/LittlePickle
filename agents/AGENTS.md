# LittlePickle UI rules

Authoritative files:

- `tokens/littlepickle.tokens.json`
- `contracts/littlepickle.components.json`
- `LittlePickle_Design_System.md`

## Required

- Light mode only.
- Use semantic tokens; never place raw hex values in components.
- Use only these component IDs: `component.action.qr`, `component.field.search`, `component.card.match`, `component.row.player`, `component.button.action`, `component.navigation.bottom`.
- Keep sections open. Only match cards receive routine elevation.
- Use Cabin for interface text and Go Mono for scores/records/compact metrics.
- Use 20 screen inset, 28 section gap, 12 standard stack, 6 compact stack.
- Use 18 card radius, 14 control radius, full-pill status radius.
- Keep all targets at least 48 × 48.
- Keep Home, Play, and Profile labels visible in bottom navigation.
- Use Club Royal for action/competition, Pickle Leaf for social/selection, Rally Berry for errors.

## Forbidden

- Dark mode or Profile content in v1.
- Dark green, neon lime, gradients, pure black, or red-brown error colors.
- Green as generic success or Rally Berry for a normal loss.
- Extra generic cards, icon-only bottom navigation, arbitrary spacing, press scaling, bounce, or decorative motion.

## Before finishing

Validate contrast, target size, text scaling, long names, focus states, and the exact Home/Play composition rules in the design-system specification.
