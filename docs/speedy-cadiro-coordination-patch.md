# SpeedyCadiro coordination patch (optional, recommended)

Both apps share GGG's per-account/per-IP rate budget. SixEyesCadiro's polling is
already far below the budget, but the one collision worth engineering away is
an analyzer request landing in the same second as a snipe. SpeedyCadiro picks
a random localhost port, so port-probing is out; a timestamp file is the
simplest cross-process signal that survives both apps restarting.

## What SixEyesCadiro already does

On every scheduler tick it reads (fail-open, cached 5s):

- Windows: `%APPDATA%\speedy-cadiro\data\activity.json`
- Linux:   `~/.config/speedy-cadiro/data/activity.json`

If the file contains `{ "travelAt": <unix ms> }` newer than the configured
hold (Settings → "Hold after SpeedyCadiro travel", default 30s), it defers all
GGG requests until the hold expires. If the file doesn't exist, nothing
changes — the patch below is optional.

## The patch to SpeedyCadiro

In the module that performs the travel (where the whisper POST succeeds and the
global cooldown starts), add a fire-and-forget write:

```ts
import { promises as fs } from "node:fs"
import path from "node:path"
import { DATA_DIR } from "./config" // same dir config.json lives in

function noteTravelForCoordination(): void {
  const file = path.join(DATA_DIR, "activity.json")
  // Best-effort: coordination must never delay or fail a travel.
  void fs.writeFile(file, JSON.stringify({ travelAt: Date.now() }), "utf8").catch(() => {})
}
```

Call `noteTravelForCoordination()` right after the whisper succeeds — the same
place the travel cooldown is armed. That's the whole patch: one write per
travel, no reads, no dependency between the apps in either direction.
