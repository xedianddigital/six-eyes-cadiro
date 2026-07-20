// Parses the loosely-structured markdown format used by the Import tab.
//
// The format that fell out of actual use (not designed up front): a line
// naming an item, followed by one or more "- variant | url" lines for that
// item's specific searches. Real drafts turned out to mix "# Name", "## Name"
// and bare "Name" headers in the same file, and pad the "|" separator
// inconsistently — so this only requires *a* line that isn't an entry line to
// start a new item, rather than policing heading syntax.
//
// # Item Name
// - variant label | https://www.pathofexile.com/trade/search/League/id
// - another variant | https://www.pathofexile.com/trade/search/League/id2
//
// # Another Item
// - any | https://www.pathofexile.com/trade/search/League/id3

export interface ParsedDraftEntry {
  itemName: string
  variant: string
  /** The markdown format has no notes concept — always empty for parsed entries. */
  notes: string
  url: string
}

const ENTRY_RE = /^-\s*(.+?)\s*\|\s*(\S+)\s*$/
const HEADING_RE = /^#{1,6}\s*(.+)$/

export function parseDraftMarkdown(text: string): ParsedDraftEntry[] {
  const out: ParsedDraftEntry[] = []
  let itemName = ""

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue

    const entry = line.match(ENTRY_RE)
    if (entry) {
      const [, variant, url] = entry
      if (itemName && /^https?:\/\//i.test(url)) {
        out.push({ itemName, variant: variant.trim(), notes: "", url })
      }
      continue
    }

    // Any non-entry, non-blank line starts a new item — "# Name", "## Name",
    // or a bare name are all treated the same way.
    const heading = line.match(HEADING_RE)
    itemName = (heading ? heading[1] : line).trim()
  }

  return out
}
