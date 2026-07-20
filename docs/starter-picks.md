# Import format

The Import tab accepts a `.md` file (or pasted text) in a format that fell
out of actual use, not designed up front:

- A line naming an item starts a new group. `#`, `##`, or a bare line with no
  marker at all are all treated the same way — only the *next* line matters,
  so mixing heading styles in one file is fine.
- Under an item, one or more `- variant label | url` lines. The label is free
  text ("any", "good roll", "145 mana", "ES%mana", …) — it exists so you can
  tell searches for the same item apart once they're all cards.
- Spacing around `|` doesn't matter, and blank lines between items are
  optional — both are for your own readability, the parser trims either way.
- Anything before the first item line is dropped, so always start with a
  name.

```
# Item Name
- variant label     | https://www.pathofexile.com/trade/search/League/id
- another variant    | https://www.pathofexile.com/trade/search/League/id2

# Another Item
- any                | https://www.pathofexile.com/trade/search/League/id3
```

Uploading the same file twice (or one with overlapping entries) is safe —
duplicate URLs are skipped, existing drafts aren't touched.

Nothing is pre-seeded into a fresh install — this is public/open-source and
the owner's own picks aren't everyone's. The parser lives in `lib/import.ts`;
the owner's own list, in this exact format, lives in `my-drafts.md` at the
repo root, for manual upload only (never read automatically).
