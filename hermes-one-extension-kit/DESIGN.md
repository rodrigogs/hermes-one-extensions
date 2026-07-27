# Hermes One panels — one visual system

**Mode: Operate**, with one exception noted below. An operator opens these to
answer a question about a machine that is running right now. Scanability and
consistency outrank expression; the identity lives in precise details, not in
decoration.

Three surfaces mount in the Hermes One central panel:

| Surface | The question it answers | Mode |
|---|---|---|
| **Router** | Is routing healthy, how does it decide, what did it decide? | Operate |
| **Memory** | What does the agent know, and how is it connected? | Operate |
| **Office** | What are my agents doing right now? | Experience — the city leads |

They previously shared nothing: three palettes (`#0a0a0c` vs `#0b0d12`), three
chip shapes, three type scales, and the office alone using brand blue where the
other two reserve colour for state. An operator had to learn three interfaces for
one agent. This file is the contract that stops that.

---

## 1. Colour means state. Nothing else.

Four hues, and they mean the same thing on every surface:

| Token | Meaning | Value |
|---|---|---|
| `--ok` | reachable, healthy, working | `#4ade9b` |
| `--warn` | needs attention, editing is armed | `#f7b955` |
| `--bad` | dead, refused, failing | `#ff6b7d` |
| `--info` | costs a model call, inference happened | `#b490ff` |

Everything else is greyscale. Emphasis is **contrast, weight and space** — which
is why `--accent` is paper white (`#f3f3f6`) and not a brand hue: a decorative
blue competing with a green health dot makes both meaningless.

The office is allowed one exception: the 3D scene has its own materials (sky,
asphalt, buildings). Those are the artefact, not the interface. Its *chrome*
obeys this table.

## 2. One surface, one masthead

Every panel opens with the same 44px bar: a monospace caps wordmark on the left,
navigation or search in the middle, live state on the right. No breadcrumb — the
host rail already says where you are, and repeating it spends a line on a fact the
operator can see. No decorative subtitle: "Seus agentes trabalhando ao vivo na
cidade 3D" describes what the picture below it already shows.

A subtitle must carry a fact the title cannot imply. Otherwise it is absent.

## 3. Type: four steps, ~1.25 apart

```
--t-label  10.5px   caps, tracked, mono      the label above a value
--t-body   13px     sans                     prose, rows, controls
--t-value  16px     mono                     numbers an operator reads
--t-head   20px     sans, -0.015em           the one heading per screen
```

Eleven sizes lived between 10 and 15px before this; differences of half a pixel
are not hierarchy, they are noise. `--mono` carries anything an operator would
copy — model names, counts, hostnames, timestamps. `--sans` carries prose.
Numerals are tabular everywhere so a column of counts lines up.

## 4. Structure comes from hairlines and space

No card is a container for its own sake, and no card nests. Rows separated by a
1px `--line` are the primitive; a group is created by space (30–38px between,
11–16px within), not by a box. More space above a heading than below it.

Radius: 7px on controls, 9px on inputs, 999px on the one pill that gates writing.

## 5. Signalling

- **A count without its window is a lie.** "16×" means nothing without "counts
  over the last 47 decisions, since 6h ago".
- **Absence has three meanings** — not asked yet, cannot ask, genuinely nothing —
  and a surface must say which. "No models reported" while the first request is
  still in flight is the most common lie an interface tells.
- **An empty state that is a finding says so.** "5 facts have no topic" is an
  operator finding, not a blank space.
- **Derived data admits it.** A relationship the system inferred names its
  evidence ("shares capability-router"); a recalled memory says it is reference
  data, not an instruction.

## 6. Writing is a locked door

One control owns write mode, and it is the only filled pill on the screen. Locked:
write controls are **absent**, not disabled. Armed: it wears `--warn`, because
"editing" is a state of the console. The committing button is the only inverted
element.

## 7. Motion: one authored moment

A panel fades its content in once, 160ms, exponential ease-out, from an
already-visible layout. No entrance animation per section, no hover flourishes.
`prefers-reduced-motion` removes it entirely. The office's orbit is interaction,
not decoration, and is exempt.

## 8. Invariants (tests depend on these)

- Every panel is a `main-view` inside `<main>`; opening one hides its siblings.
  Nothing navigates away from the shell — `window.location.assign` is a bug.
- Consoles served by a sidecar are framed with `srcdoc` (they send
  `X-Frame-Options: DENY`); the office is framed by `src` (it sends `SAMEORIGIN`).
- Panel chrome never scrolls with content; the frame fills the panel exactly.
- All text via `textContent`; no `innerHTML` on any path that can carry stored
  data. Fact and task text is attacker-influenceable.
- Focus is visible on every control, arrows move within a tablist, and rows that
  are actions are `<button>`.
