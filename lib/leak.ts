/**
 * Leak scan (public data rule). Gaurav's real story lines and real names must never reach a
 * deployed or public file. Pure matching here; scripts/leak-scan.ts gathers the files.
 */

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Names of 3+ characters, story lines of 30+ characters (short lines match too much by chance). */
export function needlesFrom(src: { names: string[]; storyLines: string[] }): string[] {
  return [...src.names.filter((n) => n.trim().length >= 3), ...src.storyLines.filter((l) => l.trim().length >= 30)].map(flat);
}

export function findLeaks(files: { path: string; text: string }[], needles: string[]): { path: string; needle: string }[] {
  const hits: { path: string; needle: string }[] = [];
  for (const f of files) {
    const text = flat(f.text);
    for (const needle of needles) if (text.includes(needle)) hits.push({ path: f.path, needle });
  }
  return hits;
}
