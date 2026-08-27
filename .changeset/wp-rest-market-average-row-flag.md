---
'@sprqvntrs/wp-rest': minor
---

Type the market-average disclosure and widen `sport_type` to american football.

Three additive type changes, all optional — no runtime code and no breaking change:

- `BlockTypes['acf/odds-comparison']` `operator_rows[]` gains `is_market_average?: boolean`.
  `true` marks a row whose odds are a median across vendor bookmakers instead of that
  operator's own published quote; WordPress renders a "market average" label for it.
  Real quotes leave the key absent.
- `WpInsertBettingTip.acf.sport_type` gains `'american_football'`. Delphi carried this
  as a local pnpm patch since the NFL launch; upstreaming it retires the patch.
- `WpInsertBettingTip.acf` gains `odds_is_market_average?: boolean`, the equivalent flag
  for the betting-tip CPT headline. Delphi has emitted it on every insert since 2026-07-16
  but had to cast the whole `acf` object because the type lacked the key.

Context (bild NFL, 2026-08-27): odds rows were attributed by bookmaker *name*, which put a
`betano_uk` price on a German site. After the vendor-id-only fix, bild had zero NFL rows —
no configured bild bookmaker publishes NFL to The Odds API (`tipico_de` is the only
German-licensed book in that feed). The fix is to fall back to a market median row for the
site's default bookmaker, which needs to be labelled honestly. This flag is that label.
