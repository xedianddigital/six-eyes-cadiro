# SixEyesCadiro — project handoff / session context

This file is the single source of context for a fresh working session (Claude
Code auto-reads `CLAUDE.md`; humans should read it too). It records what the
app is, every architectural decision already made and *why*, and what remains
to be verified. Do not re-litigate settled decisions without new information.

## What this app is

A **calm market analyzer** for Path of Exile trade listings. Windows desktop
app: Electron shell + embedded Next.js standalone server + TypeScript + pnpm.
Companion to the owner's other app, **SpeedyCadiro**
(github.com/xedianddigital/speedy-cadiro) — a live-search sniper. The two are
deliberately separate apps with opposite temperaments:

- SpeedyCadiro: fast, live WebSocket, instant Travel-to-Hideout on a match.
- SixEyesCadiro (this app): slow, polling, read-only. Never whispers, never
  travels, never touches gameplay. It answers "what does this actually sell
  for, and which way is it moving?"

Two features:

1. **Tracker** — the user pastes official trade search URLs
   (`https://www.pathofexile.com/trade/search/{league}/{id}`). Each is polled
   every ~20 min. Only **instant-buyout** listings priced in **chaos or
   divine** are recorded. Cards show ask-median (p50) with p25/p75, listing
   counts, new-listings/hour, and a p50 sparkline with trend over an
   adjustable window (6/12/18/24/48h).
2. **Discovery** — a curated universe of liquid uniques from poe.ninja's
   public API, verified a few per hour against live trade (name-only search,
   cheapest 20). Candidates whose cheap decile (p10) sits well below their own
   median (p50) are surfaced, sorted by that spread. All actions are manual:
   open / track / dismiss.

## Hard constraints (non-negotiable, from the owner and from ToS reality)

- **Not a bot, not rate-limit evasion.** One account, one IP, one shared GGG
  budget. No second-account/VPN/IP tricks — this was explicitly requested
  once and explicitly refused; the owner accepted. Every GGG request goes
  through `lib/poe/rate-limit.ts`: parses `X-Rate-Limit-*` headers, spends
  ≤40% of the tightest budget (SAFETY 0.4), ≥2000 ms between requests
  (MIN_SPACING_MS), jitter 900 ms. A 429 = "we misbehaved": hard backoff
  (≥2 min), never a faster retry.
- **"Sell price" = ask-median of instant-buyout listings.** GGG publishes no
  completed-sales feed. Instant buyout kills classic price-fixing (a fake low
  ask can simply be bought), so the cheap end is real. Median + quartiles, NOT
  mean-minus-extremes (asks are right-skewed).
- **No native modules.** Inherited from SpeedyCadiro (`npmRebuild: false`,
  Next server forked as a plain Node child). Hence the JSONL store, not
  SQLite. Do not add better-sqlite3 or similar without accepting the whole
  Electron-ABI rebuild problem.
- **No global market surveillance.** The Public Stash Tab river requires a
  `service:psapi` OAuth scope granted to established aggregators. Discovery is
  honestly scoped to the poe.ninja unique universe. Rare (3-mod) item
  discovery stays manual (user builds the search, pastes the URL).
- **Windows-only packaging**, built by GitHub Actions on `windows-latest`.
  Development happens on Linux.

## Repo map

```
electron/main.js        Electron shell (from SpeedyCadiro): forks Next standalone,
                        in-window pathofexile.com login capturing POESESSID/
                        POETOKEN/cf_clearance + the window's own User-Agent
                        (cf_clearance is UA-bound), single-instance, update check
                        against github releases, NSIS uninstall.
electron/preload.js     window.poeDesktop bridge (login, version, update, crash).
lib/poe/types.ts        All shared types + settings defaults + bounds.
lib/poe/config.ts       JSON config store (.data/config.json): session, searches,
                        settings, discovery state, divine rate. Serialized writes.
lib/poe/rate-limit.ts   Header-driven limiter (retuned calm: 0.4 / 2000ms / 900ms).
lib/poe/parse-url.ts    Trade URL -> {league, searchId}. Verbatim from SpeedyCadiro.
lib/poe/jwt.ts          Whisper-token JWT decode; `tok:"hideout"` = instant buyout.
lib/poe/poe-client.ts   Paced GGG client: validateSession (/my-account redirect
                        check), getSavedQuery (GET saved search), runSearch (POST),
                        sampleListings (fetch 10 ids -> price/currency/instant).
                        No whisper endpoint exists in this app.
lib/stats.ts            percentile/quartiles, classifyTrend (first-third vs
                        last-third medians; ±3% = stable). Display rounding
                        lives client-side in components/api.ts's chaosText.
lib/store/observations.ts  Append-only JSONL per tracked search:
                        .data/series/{id}.obs.jsonl  (observations, upsert-by-append,
                                                      deduped by listing id on load)
                        .data/series/{id}.snap.jsonl (per-poll snapshots)
                        Daily compaction to retentionDays. dropSeries on remove.
lib/engine/tracker.ts   pollSearch (cached query -> POST -> fetch pages -> divine
                        normalization -> record obs + snapshot; 400 => refetch
                        query once and retry). statsFor (card math).
lib/engine/discovery.ts refreshUniverse (poe.ninja uniques, 24h TTL, 15–6000c band,
                        top 80 by listing count, preserves dismissed/verified),
                        verifyOne (name-only search, 1 POST + 2 fetches = 20
                        cheapest; records p10/p50/spread/total/url; 12h re-verify).
lib/engine/coordination.ts  Reads SpeedyCadiro's activity.json ({travelAt}) from
                        %APPDATA%/speedy-cadiro/data or ~/.config/speedy-cadiro/data;
                        holds all GGG polling coordinationHoldSec after a travel.
                        Fail-open. SpeedyCadiro-side patch: docs/
                        speedy-cadiro-coordination-patch.md (not yet applied there).
lib/engine/scheduler.ts Singleton (globalThis guard, auto-starts on first import).
                        20s tick, ONE job per tick: divine refresh (hourly) ->
                        compaction (daily) -> ninja universe refresh -> session
                        gate -> coordination hold -> most-overdue poll (per-search
                        hash phase smears due times) -> else one discovery verify
                        within discoveryPerHour. Errors: RateLimit => 2x backoff
                        min 120s; Session/Cloudflare => 300s; other => 60s.
lib/ninja.ts            poe.ninja client, 10-min floor per URL. Divine rate +
                        unique universe (Weapon/Armour/Accessory/Jewel/Flask,
                        dedupe by name keeping most-listed line).
app/api/…               session, settings, tracked (+[id], +[id]/history),
                        discovery, status. Next 16 note: route ctx params are
                        `Promise<{id}>` and must be awaited.
components/…            api.ts (view models/fetch helpers), sparkline (dep-free
                        SVG), tracked-card, discovery-panel, session-panel
                        (desktop bridge login OR dev-mode manual cookie paste),
                        settings-panel. UI polls local server every 60s; no SSE
                        on purpose (data moves every ~20 min).
app/page.tsx            Dashboard: add form, card grid, discovery, settings.
scripts/                gen-build-info.mjs, prepare-standalone.mjs (verbatim from
                        SpeedyCadiro; the latter strips traced node_modules and
                        any stray .data before packaging).
electron-builder.yml    appId com.xediand.sixeyescadiro, productName SixEyesCadiro,
                        NSIS x64 only, asar:false, npmRebuild:false, excludes .data.
.github/workflows/build.yml  windows-latest: corepack pnpm, install
                        --frozen-lockfile (lockfile MUST stay committed),
                        typecheck, dist:win, artifact; release on v* tags.
```

## Data model in one paragraph

`config.json` holds session cookies, the tracked-search list (each with its
`cachedQuery` — the saved GGG query JSON replayed on every poll so a poll
costs 1 POST + N fetches, not GET+POST), settings, discovery candidates, and
the divine rate. Per tracked search, observations (one per distinct listing
id, chaos-normalized price, firstSeen/lastSeen) answer "what's on the market
in this window", and snapshots (per poll: total, window quartiles) draw the
trend. Card stats are always computed on read, never stored.

## Settings (all runtime-editable, clamped server-side)

league (default "Mirage" — **placeholder**; the real 3.29 league name lands
around 2026-07-25 and the user types it into Settings, nothing else needed),
pollIntervalMin 20 (10–120), windowHours 6 (6/12/18/24/48), retentionDays 14
(3–30), fetchPages 1 (1–3, ×10 listings), discoveryPerHour 4 (0–10, 0=off),
manualDivineRate 150, useNinjaRate true, coordinationHoldSec 30 (0–120).
MAX_TRACKED = 50.

## Current state

v0.1.1 — bumped from the original v0.1.0 scaffold after the first live-run
bug fixes below (no git tag yet, so no release has actually shipped).
Repo is now live at github.com/xedianddigital/six-eyes-cadiro
(git initialized, pushed, CI green on `master`). `pnpm typecheck` clean,
`next build` clean. First live run completed 2026-07-20 against the owner's
real account and the real current league (**"Mirage" is the actual live
league name, not a placeholder** — confirmed via a real trade URL and via
poe.ninja's `/poe1/api/economy/leagues`) from a container with real network
access to pathofexile.com and poe.ninja. Findings below; both bugs found are
already fixed and pushed.

Also fixed incidentally: `pnpm`'s default minimum-release-age supply-chain
policy blocked two transitive deps (`fast-uri`, `postcss`, both published
<24h before install) — `--trust-lockfile` is now used locally and in CI.
And `electron-builder` was implicitly attempting to publish to GitHub
Releases on every plain push (no `GH_TOKEN` in that context) — `dist`/
`dist:win`/`dist:dir` now pass `--publish never`; the dedicated
`action-gh-release` CI step still handles real releases on `v*` tags.

## First tasks for a fresh session (in order)

1. ~~Verify `getSavedQuery`~~ **Done 2026-07-20.** Confirmed shape is exactly
   `{id, query}` — no `sort` ever comes back, because sort is trade-site
   client state, not server state. This was a real bug: without an explicit
   sort, tracked-search polls sampled GGG's *default* order, not price
   order, contradicting tracker.ts's "cheap frontier" assumption the whole
   app is built on. Fixed: `getSavedQuery` now forces `sort:{price:"asc"}`
   when the response doesn't supply one (discovery.ts's generated queries
   already did this correctly).
2. ~~Verify instant-buyout detection~~ **Done 2026-07-20.** `hideout_token`
   with `tok:"hideout"` confirmed present on real `/api/trade/fetch` results
   for a saved search, decodes exactly as `jwt.ts` expects. No fix needed.
3. ~~Watch the rate headers~~ **Done 2026-07-20.** Limiter widened spacing to
   12.5s under real budget pressure early on, settled back to the 2000ms
   floor once usage dropped; no 429 seen. Looks sane.
3a. **New, unplanned finding: poe.ninja's API had moved entirely.** The old
   flat `/api/data/itemoverview` and `/api/data/currencyoverview` paths
   404 for every league now (poe.ninja split PoE1/PoE2 under
   `/poe1/api/economy/...` at some point after this app was written). Fixed
   in `lib/ninja.ts` against their now-published reference at
   poe.ninja/docs/api; field names were unchanged, only the base path moved.
   Confirmed live: divine rate resolves via ninja (not the manual fallback),
   discovery universe pulled 80 real candidates.
4. Run inside Electron (`pnpm electron` against `pnpm dev`, then a packaged
   `pnpm dist:dir`), confirm the login window flow stores a valid session.
   **Still open** — needs a display; not done from this Linux container.
5. Apply the SpeedyCadiro coordination patch (docs/) in that repo, then test
   the hold: run both, travel in SpeedyCadiro, see this scheduler report
   "holding for SpeedyCadiro". **Still open** — touches a second repo,
   deliberately not done without asking first.
6. League rename when 3.29 launches: Settings → League. Tracked URLs carry
   their own league; old-league cards just go stale and can be removed.
   **Not yet needed** — "Mirage" is still the live league as of 2026-07-20.

## Conventions

- Comments explain *why*, not *what* (see any file in lib/). Keep that.
- Every GGG request MUST go through `paced()` in poe-client.ts. There is no
  legitimate reason for an unpaced call in this app (unlike SpeedyCadiro,
  which has documented exceptions for time-critical snipe requests).
- Clamp user input server-side rather than rejecting (see settings route).
- Fail open on anything optional (coordination, ninja), fail loud on anything
  that misleads the user (a card with a stale error shows it in amber).
- Node 22 (.nvmrc), pnpm, no new runtime deps without a reason that survives
  the "no native modules" rule.

## Known deliberate limitations

- Ask-medians, not sales. Stated in the UI footer and README; keep it stated.
- Discovery covers uniques only; 3-mod rare hunting is the user's job via
  pasted URLs (mod-value axes don't survive a name-only search).
- First hours after adding a search show "collecting…" — trend needs ≥4
  snapshots by design. Do not "fix" by polling faster.
- Sparkline has no axes/tooltips on purpose: cards are for glancing.
