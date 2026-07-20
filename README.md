# Six Eyes Cadiro

![Cadiro](cadiro.png)

A dashboard for Path of Exile trade listings — the slow, patient
counterpart to [SpeedyCadiro](https://github.com/xedianddigital/speedy-cadiro).

Paste official trade search URLs. Each one is polled on a relaxed interval
(default every 20 minutes), only instant-buyout listings priced in chaos or
divine orbs are recorded, and each dashboard card answers one question at a
glance: *what does this actually sell for right now, and which way is it
moving?* — median with quartiles over an adjustable window (6/12/18/24/48h),
listing volume, new-listings-per-hour, and a trend sparkline.

A discovery panel supplements your own watchlist: poe.ninja's public economy
data defines a universe of liquid uniques, and a trickle rotation (a few
verifications per hour) checks the most interesting ones against live trade,
surfacing candidates whose cheap end sits well below their own median. Every
candidate is a manual decision — open it, track it, or dismiss it.

Everything runs on your machine. Your session is stored locally and sent
nowhere except pathofexile.com; poe.ninja is queried anonymously for public
aggregate data.

## What this deliberately is not

- **Not a bot.** It never whispers, travels, trades, or touches gameplay in
  any way. It reads listings — slowly.
- **Not a rate-limit workaround.** One account, one IP, one shared budget.
  Every request to pathofexile.com goes through a limiter that parses GGG's
  published `X-Rate-Limit-*` headers and stays under 40% of the tightest
  budget with a 2-second floor between requests. A 429 is treated as "we
  misbehaved": hard backoff, never a faster retry.
- **Not a sales feed.** GGG publishes asks, not completed sales. The medians
  here are ask medians of instant-buyout listings — which cannot be
  price-fixed with fake low listings — tracked over hours. Treat them as a
  strong estimate, not gospel.
- **Not global market surveillance.** The Public Stash Tab river is gated
  behind a service OAuth scope granted to established aggregators; discovery
  here is honestly scoped to a curated poe.ninja universe instead.

## Install (Windows)

Download `Six Eyes Cadiro-Setup-x.y.z.exe` from the latest release and run it.
SmartScreen will warn on first run because the binary isn't code-signed —
"More info → Run anyway". The project is open source and built in public.

## Using it

1. **Sign in** — click *Sign in to pathofexile.com* and log in as usual. Log
   out any time from the header once signed in.
2. **Set the league** — File → Settings (or the ⚙ in the header) → League
   (used for discovery and generated searches; tracked URLs carry their own
   league regardless).
3. **Add searches, via Import** — build a search on the official trade site
   with the filters that matter, copy the URL. On the Import tab, either add
   one at a time (Name + optional Details + the URL) or upload/paste a `.md`
   list (format in `docs/starter-picks.md`: an item name, then one or more
   `- variant | url` lines under it). Either way it sits as a draft until you
   click **promote** — that's what actually starts polling it, up to 50.
4. **Read the cards** — big number = median ask (chaos; divine listings
   normalized at the live rate). Below it, two live counts: how many listings
   are priced at or below 50% / 75% of that median right now — normally both
   zero, a nonzero count is an actual mispricing, not a percentile. Colored
   line = direction. Buy-below and stop-buying decisions come from the same
   glance.
5. **Review discovery** — sorted by spread (median vs cheapest decile).
   "Open" shows it on the trade site with your own eyes before you commit.

## Verify on first live run

Two GGG endpoints are used in ways their docs don't fully specify; both are
written defensively but must be confirmed against real traffic once:

1. `GET /api/trade/search/{league}/{id}` — assumed to return the saved query
   (used as `{query, sort}` for the re-POST; falls back to the whole body
   minus `id`). Check `lib/poe/poe-client.ts → getSavedQuery`.
2. Instant-buyout detection via the whisper token's `tok: "hideout"` claim —
   confirmed in SpeedyCadiro, re-confirm it holds for fetch results that were
   *not* delivered by live search.

If either shape differs, the fix is local to `poe-client.ts`.
