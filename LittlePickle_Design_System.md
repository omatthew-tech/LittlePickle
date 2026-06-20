# LittlePickle Design System

**Version:** 1.0.0  
**Updated:** 2026-06-19  
**Platform:** Mobile app, light mode only  
**Product:** Local social pickleball club  
**Screen scope:** Home and Play; Profile remains a navigation destination but its content is outside this release.

## 1. Product character

LittlePickle should feel **proper, relaxed, fun, and slightly competitive**. It should resemble a well-run local club rather than a fitness-tech platform or a children’s game.

### Design principles

1. **Open court.** Prefer whitespace and dividers to extra containers. The match card is the only routinely elevated surface.
2. **Social green, competitive blue.** Pale green signals people, recommendations, invitations, and selection. Royal blue carries action, navigation, scores, and winning states.
3. **Friendly, not childish.** Use warm paper, restrained curves, and one playful rally-loop detail. Avoid novelty typography, loud gradients, and cartoon styling.
4. **Labels remain visible.** Navigation and important actions always use text with icons.
5. **Minimal component inventory.** Build the three-screen app from six core components before introducing anything new.

## 2. Canonical source of truth

Use the files in this package in this order:

1. `tokens/littlepickle.tokens.json` — canonical visual tokens and aliases.
2. `contracts/littlepickle.components.json` — component identities, props, states, constraints, events, and accessibility rules.
3. `LittlePickle_Design_System.md` — human-readable guidance and composition rules.
4. `agents/AGENTS.md` — concise generation and review rules for coding agents.
5. `web/littlepickle.css` — optional web/prototype projection; it is not the canonical token source.

Components must consume semantic tokens. Raw hex values, arbitrary spacing, and one-off typography are not allowed in component implementations.

## 3. Color system — Saturday Club

### Raw palette

| Token | Name | Value | Primary use |
|---|---|---:|---|
| `color.blue.100` | Blue Chalk | `#E8ECFA` | Soft pressed, informational, and secondary surfaces |
| `color.blue.500` | Club Royal | `#4B63C6` | Primary actions, active navigation, wins |
| `color.blue.700` | Match Point | `#3D50A8` | Pressed actions, scores, selected text |
| `color.green.300` | Pickle Leaf | `#CBDDA4` | Social recommendations, invitations, selection |
| `color.paper.50` | Court Paper | `#F6F2E8` | App canvas |
| `color.paper.0` | Club Card | `#FFFDF8` | Cards, fields, controls |
| `color.ink.900` | Scoreboard Ink | `#22283A` | Primary text, headings, scores |
| `color.gray.600` | Net Cord | `#686D7A` | Secondary text, inactive navigation |
| `color.gray.400` | Court Edge | `#7F8592` | Interactive boundaries |
| `color.gray.150` | Shoe Dust | `#D8D5CD` | Quiet borders and dividers |
| `color.berry.500` | Rally Berry | `#BE3E68` | Errors and failed actions only |

### Semantic roles

| Semantic token | Alias |
|---|---|
| `color.surface.canvas` | `color.paper.50` |
| `color.surface.card` | `color.paper.0` |
| `color.surface.info` | `color.blue.100` |
| `color.surface.social` | `color.green.300` |
| `color.text.primary` | `color.ink.900` |
| `color.text.secondary` | `color.gray.600` |
| `color.text.on-primary` | `color.paper.0` |
| `color.text.selected` | `color.blue.700` |
| `color.action.primary` | `color.blue.500` |
| `color.action.primary-pressed` | `color.blue.700` |
| `color.border.control` | `color.gray.400` |
| `color.border.subtle` | `color.gray.150` |
| `color.focus.ring` | `color.blue.500` |
| `color.feedback.error` | `color.berry.500` |

### Color rules

- LittlePickle has **no dark green**.
- Green is always light, social, and welcoming. It is not a generic success color.
- Wins use Club Royal plus an explicit `Winner` or `W` label.
- Losses remain neutral; never use error red for a normal loss.
- Rally Berry is reserved for invalid scores, failed scans, unavailable cameras, and form errors.
- Never communicate state through color alone. Pair color with text, iconography, or a shape change.
- Do not add gradients, neon lime, pure black, or full-screen royal-blue backgrounds.
- Green should remain a small accent, usually below roughly 10% of a screen.

### Approved contrast pairs

| Pair | Ratio |
|---|---:|
| Club Card on Club Royal | 5.30:1 |
| Scoreboard Ink on Court Paper | 13.11:1 |
| Net Cord on Court Paper | 4.63:1 |
| Match Point on Pickle Leaf | 4.95:1 |
| Rally Berry on Court Paper | 4.61:1 |
| Court Edge on Court Paper | 3.31:1 |
| Club Royal on Court Paper | 4.82:1 |

## 4. Typography — Cabin League

### Families

```text
Interface: "Cabin", system-ui, -apple-system, "Segoe UI", sans-serif
Metrics:   "Go Mono", ui-monospace, "SFMono-Regular", Consolas, monospace
```

Cabin carries the club warmth. Go Mono appears only where information is measured or competitive.

### Semantic type roles

| Token | Family | Weight | Size / line height | Use |
|---|---|---:|---:|---|
| `type.heading.brand` | Cabin | 700 | 32 / 40 | LittlePickle wordmark or welcome moment |
| `type.heading.page` | Cabin | 700 | 28 / 36 | Home and Play page titles |
| `type.heading.section` | Cabin | 600 | 20 / 24 | Recommended matches, Current players |
| `type.title.card` | Cabin | 600 | 17 / 24 | Player names and card titles |
| `type.body.default` | Cabin | 400 | 16 / 24 | Main interface copy and input text |
| `type.body.secondary` | Cabin | 400 | 14 / 20 | Supporting details and timestamps |
| `type.label.action` | Cabin | 600 | 16 / 20 | Buttons and text actions |
| `type.label.navigation` | Cabin | 600 | 12 / 16 | Home, Play, Profile |
| `type.metric.score` | Go Mono | 700 | 36 / 40 | Match scores |
| `type.metric.record` | Go Mono | 700 | 24 / 28 | Win–loss records |
| `type.metric.detail` | Go Mono | 400 | 14 / 20 | Court, time, compact statistics |

### Typography rules

- Use sentence case for headings, buttons, labels, and navigation.
- Reserve uppercase for short statuses such as `FINAL` and `LIVE`.
- Use an en dash in scores and records: `11–8`, `4–1`.
- Do not use leading zeroes in records.
- Player names always use Cabin, never Go Mono.
- Avoid italics in the product interface.
- Avoid Cabin ExtraBold.
- Tracking: page headings `-0.01em`; large scores `-0.02em`; body `0`; small labels `+0.01em`.
- Preserve operating-system text scaling. Text containers must expand instead of clipping.

## 5. Spacing and layout — Rally Grid

All values are logical mobile units: pt on iOS and dp on Android.

### Raw spacing tokens

`0, 2, 4, 6, 8, 12, 16, 20, 24, 28, 32, 40, 48, 64`

`28` is the one deliberate off-scale value and is reserved for major section separation.

### Semantic spacing

| Token | Value | Use |
|---|---:|---|
| `layout.screen.inset` | 20 | Left and right screen inset |
| `layout.section.gap` | 28 | Between distinct sections |
| `layout.stack.default` | 12 | Standard vertical stack |
| `layout.stack.compact` | 6 | Player rows and dense match details |
| `layout.inline.default` | 12 | Side-by-side controls |
| `layout.icon-label.gap` | 6 | Icon to label |
| `layout.card.padding` | 16 | Match-card padding |

### Dimensions

| Token | Value | Rule |
|---|---:|---|
| `size.target.minimum` | 48 | Minimum interactive target in both axes |
| `size.control.minimum-height` | 52 | Buttons and search fields; use as a minimum, not a clipping height |
| `size.player-row.minimum-height` | 64 | Default player-row minimum |
| `size.qr-action.minimum-height` | 160 | Home QR action |
| `size.navigation.bottom-height` | 72 | Excluding platform safe-area inset |
| `size.avatar.default` | 36 | Player avatar or monogram |

### Layout rules

- Use parent `gap` or stack rules; do not accumulate child margins.
- A screen uses a single 20-unit horizontal inset.
- Keep micro spacing discrete. This app does not need responsive fluid spacing.
- The content layer scrolls; the bottom navigation remains fixed and respects the platform safe area.
- Sections remain open unless the content is a match card.
- Long names may wrap to two lines; rows expand vertically.

## 6. Shape and elevation — Soft Baseline

| Token | Value | Use |
|---|---:|---|
| `radius.card` | 18 | Match cards |
| `radius.control` | 14 | Buttons, fields, QR action, active nav pill |
| `radius.pill` | 999 | Compact statuses and chips |
| `border.interactive` | 1.5 | Controls and active navigation |
| `border.quiet` | 1 | Match cards and dividers |
| `elevation.card` | `0 4 12 rgba(34,40,58,0.10)` | Match card only |

Rules:

- Do not box every section.
- The match card is the only routinely elevated component.
- Pressed controls lose elevation without shrinking or scaling.
- Use surface layering before adding another shadow.

## 7. Iconography and navigation — Rally Loop

### Icon construction

- Default icon: 24 × 24.
- Compact icon: 20 × 20.
- Primary action icon: 28 × 28.
- Stroke: 2.25 with rounded caps and joins.
- Movement-related icons may use one restrained curved rally tail: Play, Scan, History, and match actions.
- Search, Profile, and basic controls remain simpler.
- Icons use `currentColor` and must not hard-code fills except for intentionally tokenized accent dots.

### Stable icon names

`icon.navigation.home`  
`icon.navigation.play`  
`icon.navigation.profile`  
`icon.action.scan`  
`icon.action.search`  
`icon.action.add-player`  
`icon.match.history`  
`icon.match.score`  
`icon.state.check`  
`icon.state.error`

### Bottom-navigation treatment

- Active: Club Royal outlined pill, Club Royal icon, Club Royal label.
- Inactive: no container, Net Cord icon and label.
- Always show icon plus label.
- Active state uses shape and color, not color alone.

SVG source files are included in `icons/`.

## 8. Core components — Open Court

LittlePickle v1 uses exactly six core components. Text actions such as `Pass` and `View match history` are variants of the action-button component rather than separate components.

### 8.1 QR action

**ID:** `component.action.qr`

Purpose: begin league entry from the Home screen.

- Full width; minimum height 160; padding 20.
- Club Card surface, 1.5 Court Edge border, 14 radius.
- 28-unit Scan icon, section-heading label, optional secondary line.
- Default label: `Scan league QR`.
- Pressed: Blue Chalk surface and Club Royal border; no scale animation.
- Focus: 2-unit Club Royal ring with 2-unit offset.
- Error: Rally Berry border plus visible error text and error icon.
- Accessibility role: button. Accessible name must describe the action, for example `Scan league QR code`.
- Event: `scanRequested`.

Do not place the QR action inside another card.

### 8.2 Search field

**ID:** `component.field.search`

Purpose: search leagues on Home or players on Play.

- Full width; minimum height 52; 16 horizontal padding; 14 radius.
- Club Card surface, 1.5 Court Edge border.
- 20-unit Search icon; 6-unit icon-label gap.
- Use a persistent accessible label even when the visible UI relies on a placeholder.
- Focus: Club Royal border and 2-unit outer focus ring.
- Error: Rally Berry border, error icon, and visible error message.
- Events: `queryChanged`, `querySubmitted`, optional `queryCleared`.

Approved visible strings:

- Home: `Search for a league`
- Play: `Search players`

### 8.3 Match card

**ID:** `component.card.match`

Purpose: present a recommended or active match and its score-report action.

- Club Card surface, 18 radius, 16 padding, 1 Shoe Dust border, card elevation.
- Do not nest cards inside it.
- Internal structure: optional metadata, Team A player rows, `VS`, Team B player rows, primary report action.
- Team and player information uses open rows and dividers.
- `Pass` is a text-action variant with a 48-unit invisible target.
- `Report score` uses the primary action variant.
- Completed scores use Go Mono. Winner state uses blue plus a `Winner` or `W` label.
- Accessibility: expose the card as a named group or section; do not make the entire card one large button.
- Events: `playerPassed`, `scoreReportRequested`.

### 8.4 Player row

**ID:** `component.row.player`

Purpose: list a current player or a player within a match.

- Default presentation is open with a Shoe Dust divider, not a card.
- Minimum height 64; 36-unit avatar; 12-unit content gap.
- Name uses `type.title.card`; supporting information uses `type.body.secondary`.
- The trailing action has a minimum 48 × 48 target.
- Selected state may use a Pickle Leaf surface with a 14 radius and a visible check indicator.
- Availability must be written in text, not shown by color alone.
- Event: `playerSelectionChanged`.

### 8.5 Action button

**ID:** `component.button.action`

Variants:

- `primary`: Club Royal surface, Club Card text, minimum height 52, 14 radius.
- `text`: transparent surface, Club Royal label, minimum 48-unit target.

Rules:

- Primary pressed state uses Match Point and removes elevation.
- Focus uses the standard Club Royal focus ring.
- Disabled uses Shoe Dust and Net Cord; it remains visibly labeled.
- Do not scale the button on press.
- Do not use all-caps labels.
- Events: `pressed`.

### 8.6 Bottom navigation

**ID:** `component.navigation.bottom`

Purpose: move among Home, Play, and Profile.

- Exactly three items in this order: Home, Play, Profile.
- Height 72 plus safe-area inset; Club Card surface; Shoe Dust top border.
- Each item has at least a 48 × 48 target.
- Active item uses the Rally Loop active outlined pill.
- Inactive items use Net Cord and no container.
- Use 24-unit icons and `type.label.navigation` labels.
- Native: expose selected state through the platform tab-bar API.
- Web prototype: use a navigation landmark and `aria-current="page"`.
- Event: `destinationChanged`.

## 9. Screen patterns

### Home

**Pattern ID:** `pattern.screen.home`

1. Screen safe area and 20-unit inset.
2. LittlePickle brand heading.
3. 28-unit section gap.
4. QR action.
5. 12-unit stack gap.
6. Centered `or` in secondary text.
7. 12-unit stack gap.
8. League search field.
9. Flexible open space.
10. Bottom navigation with Home active.

Do not add a promotional card, hero gradient, or recommended-match block to Home unless product scope changes.

### Play

**Pattern ID:** `pattern.screen.play`

1. Page title: `Recommended matches`.
2. 12-unit gap to match cards; 6-unit gap between multiple match cards.
3. 28-unit section gap.
4. Section heading: `Current players`.
5. 12-unit gap to player search.
6. 12-unit gap to the player list; rows use dividers or 6-unit list gaps.
7. Text action: `View match history` with History icon.
8. Bottom navigation with Play active.

### Profile

Profile remains a bottom-navigation destination. No profile-specific layout or components are defined in v1.

## 10. Content style

- Tone: welcoming, clear, lightly competitive, never aggressive.
- Prefer short action verbs: `Scan`, `Search`, `Pass`, `Add`, `Report score`.
- Use `Recommended matches`, not `Suggested battles` or other gamified language.
- Use `Current players`, not `Users online`.
- Avoid slang, excessive exclamation marks, and hype copy.
- Show dates and times in the user’s locale. Keep the match score itself locale-independent.
- Error messages state what happened and the next action: `That QR code is not for a LittlePickle league. Try another code.`

## 11. Accessibility requirements

- Target WCAG 2.2 AA for any web surface and equivalent native-platform accessibility guidance.
- Normal text must meet 4.5:1; meaningful non-text boundaries and icons must meet 3:1.
- Minimum target size is 48 × 48.
- Keep operating-system font scaling enabled.
- Do not clip text at larger accessibility sizes. Use minimum heights rather than fixed heights.
- Every icon-only affordance must have an accessible name; bottom navigation is never icon-only.
- Focus indicators use Club Royal, 2-unit thickness, and 2-unit offset.
- Status, winner, error, availability, and selection states use text or icons in addition to color.
- QR scanning must request camera permission only after user activation and provide a non-camera fallback through league search.
- Respect reduced-motion settings. LittlePickle does not require decorative motion.

## 12. Minimal interaction behavior

- Color, border, and shadow transitions may use `120ms ease-out`.
- No scale, bounce, parallax, or looping animation.
- Pressed states are visible immediately.
- With reduced motion enabled, remove nonessential transitions.

## 13. AI-agent rules

An agent generating or modifying LittlePickle UI must:

1. Use semantic token references from `littlepickle.tokens.json`.
2. Use only the six core component IDs unless a new component is explicitly approved.
3. Prefer open sections and dividers. Do not wrap sections in generic cards.
4. Keep the match card as the only routinely elevated component.
5. Use Club Royal for action and competition; Pickle Leaf for social/selection; Rally Berry for errors only.
6. Use Cabin for interface text and Go Mono only for scores, records, time, and compact metrics.
7. Use the Rally Grid spacing values; never invent a new spacing value.
8. Keep navigation labels visible and the active item inside an outlined pill.
9. Preserve 48-unit targets, focus states, text scaling, and non-color state cues.
10. Generate light mode only.

An agent must not:

- create dark mode;
- add dark green, gradients, neon color, pure black, or muddy red-brown;
- use green as a generic success signal;
- use Rally Berry for a normal match loss;
- use raw hex values in components;
- add icon-only bottom navigation;
- add a card around every section;
- add press scaling or decorative motion;
- design Profile content in this release.

## 14. Release checklist

Before accepting a screen or component:

- All colors resolve through semantic tokens.
- Cabin and Go Mono are used only in their approved roles.
- Screen inset is 20; major section gap is 28; standard stack is 12; compact stack is 6.
- Cards use 18 radius; controls use 14; chips use full pill.
- Only the match card receives the standard shadow.
- Rally Loop icons use approved sizes and visible labels where required.
- All interactive elements have default, pressed, focused, and disabled behavior where applicable.
- Selected and error states use more than color alone.
- Targets are at least 48 × 48.
- Long player and league names wrap without clipping.
- Home and Play follow their approved screen patterns.
- Profile content has not been invented.

## 15. Versioning and provenance

- Current version: `1.0.0`, status `stable`.
- Token or contract IDs are stable. Change values behind semantic aliases before renaming IDs.
- Breaking component API or token-name changes require a major version.
- Visual value changes that preserve component contracts require a minor version.
- Documentation-only corrections require a patch version.
- Source: approved LittlePickle design workshop decisions and the supplied Home and Play wireframes.
