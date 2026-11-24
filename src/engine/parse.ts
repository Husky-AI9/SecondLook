/** Pulls the first JSON object out of model output, tolerating code fences and chatter. */
export function extractJson(text: string): unknown | null {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          try {
            // Trailing commas are the most common slip from small models.
            return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
          } catch {
            return null;
          }
        }
      }
    }
  }
  return null;
}
