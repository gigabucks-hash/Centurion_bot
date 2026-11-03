/**
 * Minimal ICU MessageFormat renderer for the @centurion/i18n catalog: `{arg}`, `{n, plural, =0 {…}
 * one {…} other {…}}` with `#`, and `{x, select, a {…} other {…}}`. Output is a plain string for a
 * text node (never HTML). Missing args render as an empty string, never `{arg}`.
 */
export type IcuArgs = Record<string, string | number>;

type Node = string | { arg: string; kind?: "plural" | "select"; opts?: Record<string, Node[]> };

function parse(src: string, i = 0, inPlural = false): [Node[], number] {
  const out: Node[] = [];
  let buf = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "}") break;
    if (c === "#" && inPlural) {
      if (buf) out.push(buf), (buf = "");
      out.push({ arg: "#" });
      i++;
      continue;
    }
    if (c === "'" && src[i + 1] === "'") { buf += "'"; i += 2; continue; }
    if (c !== "{") { buf += c; i++; continue; }
    if (buf) out.push(buf), (buf = "");
    // {name} | {name, plural|select, k {..} ...}
    let j = src.indexOf("}", i);
    const comma = src.indexOf(",", i);
    if (comma === -1 || comma > j) {
      out.push({ arg: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    const arg = src.slice(i + 1, comma).trim();
    const c2 = src.indexOf(",", comma + 1);
    const kind = src.slice(comma + 1, c2).trim() as "plural" | "select";
    j = c2 + 1;
    const opts: Record<string, Node[]> = {};
    for (;;) {
      while (/\s/.test(src[j])) j++;
      if (src[j] === "}") { j++; break; }
      const b = src.indexOf("{", j);
      const key = src.slice(j, b).trim();
      const [body, end] = parse(src, b + 1, kind === "plural" || inPlural);
      opts[key] = body;
      j = end + 1;
    }
    out.push({ arg, kind, opts });
    i = j;
  }
  if (buf) out.push(buf);
  return [out, i];
}

const cache = new Map<string, Node[]>();
const pluralRules = new Map<string, Intl.PluralRules>();

function render(nodes: Node[], args: IcuArgs, locale: string, n?: number): string {
  let s = "";
  for (const node of nodes) {
    if (typeof node === "string") { s += node; continue; }
    if (node.arg === "#") { s += n != null ? new Intl.NumberFormat(locale).format(n) : ""; continue; }
    const v = args[node.arg];
    if (!node.kind) { s += v == null ? "" : String(v); continue; }
    const opts = node.opts!;
    if (node.kind === "plural") {
      const num = Number(v ?? 0);
      let pr = pluralRules.get(locale);
      if (!pr) pluralRules.set(locale, (pr = new Intl.PluralRules(locale)));
      const branch = opts[`=${num}`] ?? opts[pr.select(num)] ?? opts.other ?? [];
      s += render(branch, args, locale, num);
    } else {
      s += render(opts[String(v)] ?? opts.other ?? [], args, locale, n);
    }
  }
  return s;
}

export function formatIcu(msg: string, args: IcuArgs = {}, locale = "id-ID"): string {
  let nodes = cache.get(msg);
  if (!nodes) cache.set(msg, (nodes = parse(msg)[0]));
  return render(nodes, args, locale);
}
/** Argument names a message uses (to append unused extra args, e.g. a reason badge). */
export const icuArgNames = (msg: string) => new Set([...msg.matchAll(/\{\s*([a-z_]+)\s*[,}]/g)].map((m) => m[1]));
