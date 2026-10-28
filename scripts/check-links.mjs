#!/usr/bin/env node
// check-links.mjs: the deterministic link half of content-audit.
// Crawls same-origin HTML pages from a start URL and checks every link once.
// Usage: node check-links.mjs <url> [--max-pages N] [--max-links N] [--json] [--no-browser]
// Exit: 0 no BROKEN link, 1 at least one BROKEN, 2 usage error.
// Bot-blocked responses get one retry in a normal browser (Playwright, if
// installed), then BLOCKED. Never BROKEN. The client identifies itself honestly.
// Hardening: bodies are streamed and capped, links are capped, one browser per
// run, HTML is scanned without backtracking regexes, and from a public start no
// private, loopback or metadata address is ever fetched, on any redirect hop. The
// address is checked inside the socket's own lookup, so a second DNS answer cannot
// swap a private address in after the check (DNS rebinding). Browser retries run last in one
// Chromium whose resolver is pinned to the vetted addresses; every other name fails to resolve.
import { pathToFileURL } from 'node:url';
import { isIP, BlockList } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';

const UA = 'content-audit-link-check/1.0 (+advisory site audit)';
const BLOCK_CODES = new Set([401, 403, 429, 999]);
const SOFT404 = /\b(404|not found|page (does not|doesn't) exist|no longer available)\b/i;
const SKIP = /^(javascript:|data:|blob:|about:)/i;
const MAILTO = /^mailto:[^@\s?]+@[^@\s?]+\.[^@\s?]+(\?.*)?$/i;
const TEL = /^tel:\+?[0-9().\- ]{5,}$/i;
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'your', 'this', 'that', 'read', 'more', 'here', 'click', 'about', 'view', 'page']);
const BODY_CAP = 2_000_000;   // bytes of HTML read per response
const MAX_HOPS = 10;          // redirects followed per URL
const TAG_MAX = 8192;         // longest tag we parse
const TEXT_MAX = 1000;        // anchor text, title and h1 window
const MAX_PAGES_CLI = 10000;

// Every address a public audit must never connect to: private, loopback, link-local, CGNAT,
// benchmark, multicast, reserved, broadcast, NAT64, ULA, IPv4-mapped and IPv4-compatible.
const BLOCK = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]]) {
  BLOCK.addSubnet(net, bits, 'ipv4');
}
BLOCK.addAddress('255.255.255.255', 'ipv4');
// ::ffff:0:0/96 is not a rule here: BlockList checks every IPv4 address against the IPv6 rules
// in its mapped form, so that rule would block all of IPv4. blockedIp refuses it instead.
for (const [net, bits] of [['::', 128], ['::1', 128], ['::', 96], ['64:ff9b::', 96],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  BLOCK.addSubnet(net, bits, 'ipv6');
}

// The eight hextets of a canonical (WHATWG-serialised, all-hex) IPv6 address, as numbers.
function hextets(canon) {
  const [l, r] = canon.split('::'), L = l ? l.split(':') : [], R = r ? r.split(':') : [];
  const all = r === undefined ? L : [...L, ...Array(8 - L.length - R.length).fill('0'), ...R];
  return all.map((x) => parseInt(x, 16));
}
const v4of = (hi, lo) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

// Classifies one address. Any IPv4-mapped IPv6 address (::ffff:0:0/96, found on the canonical
// form) is refused whatever IPv4 it carries, which also covers every private IPv4 inside it.
// 6to4 (2002::/16) and Teredo (2001:0::/32) are refused when the IPv4 they embed is blocked.
function blockedIp(ip) {
  const a = String(ip).split('%')[0], v = isIP(a);
  if (v === 4) return BLOCK.check(a, 'ipv4');
  if (v !== 6) return false;
  const canon = new URL(`http://[${a}]/`).hostname.slice(1, -1), n = hextets(canon);
  if (n[0] === 0x2002 && BLOCK.check(v4of(n[1], n[2]), 'ipv4')) return true;
  if (n[0] === 0x2001 && n[1] === 0 && BLOCK.check(v4of(~n[6] & 0xffff, ~n[7] & 0xffff), 'ipv4')) return true;
  return /^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(canon) || BLOCK.check(a, 'ipv6');
}

// Canonical host: the WHATWG URL parser turns decimal, octal and hex IPv4 into dotted form and
// compresses IPv6; brackets and one trailing dot are then dropped. No pattern matching on the text.
function normHost(host) {
  let h = String(host).trim();
  if (h.includes(':') && !h.startsWith('[')) h = `[${h}]`;
  try { h = new URL(`http://${h}/`).hostname; } catch { h = h.toLowerCase(); }
  return h.replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

// A literal is classified by its address; a name only by the names that never leave the machine.
export function isPrivateHost(host) {
  const h = normHost(host);
  if (isIP(h)) return blockedIp(h);
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local');
}

// True when the host is a private name or literal, or when any address it resolves to is private.
async function resolvesPrivate(host, lookup) {
  const h = normHost(host);
  if (isPrivateHost(h)) return true;
  if (isIP(h)) return false;
  const addrs = await lookup(h, { all: true });
  return addrs.some((a) => blockedIp(a.address));
}

// The browser's own guard: true only when the URL's host is public by every address it
// resolves to. A failed or late lookup fails closed.
export async function browserAllowed(url, lookup, timeoutMs = 10000) {
  try { return !(await timed(resolvesPrivate(new URL(url).hostname, lookup), timeoutMs)); } catch { return false; }
}

// The one address the browser may use for a host, or null. Only plain DNS names and public
// literals pin: a name with a rule character (`*`, `,`) could widen or break the rule list.
async function pinAddr(host, lookup) {
  const h = normHost(host);
  if (isPrivateHost(h)) return null;
  if (isIP(h)) return h;
  if (!/^[a-z0-9._-]+$/.test(h)) return null;
  const addrs = await lookup(h, { all: true });
  return addrs.length && !addrs.some((a) => blockedIp(a.address)) ? addrs[0].address : null;
}

// Chromium --host-resolver-rules: each vetted host maps to its vetted address (IPv6 in
// brackets), and the catch-all last makes every other name fail to resolve.
export function hostRules(pairs) {
  return [...pairs.map(([h, ip]) => `MAP ${h} ${isIP(ip) === 6 ? `[${ip}]` : ip}`), 'MAP * ~NOTFOUND'].join(', ');
}

const bare = (h) => h.replace(/^www\./i, '').toLowerCase();
const words = (s) => (s.toLowerCase().replace(/&#?[a-z0-9]+;/g, ' ').match(/[a-z0-9]{4,}/g) ?? []).filter((w) => !STOP.has(w));

// Inner text of the first <tag>...</tag>, found with indexOf and bounded, so no regex backtracks.
function innerOf(body, tag) {
  const lower = body.length > BODY_CAP ? body.slice(0, BODY_CAP).toLowerCase() : body.toLowerCase();
  const re = new RegExp(`<${tag}[\\s>]`, 'g');
  const m = re.exec(lower);
  if (!m) return '';
  const gt = lower.indexOf('>', m.index);
  if (gt < 0) return '';
  const end = lower.indexOf(`</${tag}`, gt);
  return body.slice(gt + 1, Math.min(end < 0 ? Infinity : end, gt + 1 + TEXT_MAX)).trim();
}
const titleOf = (body) => innerOf(body, 'title');

export function destinationWarnings({ linkUrl, finalUrl, hops, startUrl, anchorText, title, body, h1 }) {
  const out = [];
  const link = new URL(linkUrl), fin = new URL(finalUrl ?? linkUrl), start = new URL(startUrl);
  const startPrivate = isPrivateHost(start.hostname);
  if (hops > 1) out.push('redirect-chain');
  if (hops > 0 && fin.pathname === '/' && link.pathname !== '/' && bare(fin.hostname) === bare(link.hostname)) out.push('redirect-to-home');
  if (hops > 0 && bare(fin.hostname) !== bare(link.hostname)) out.push('domain-change');
  if (link.protocol === 'http:' && !startPrivate) out.push('insecure-http');
  if (isPrivateHost(link.hostname) && !startPrivate) out.push('private-host');
  const head = h1 ?? innerOf(body ?? '', 'h1');
  if (SOFT404.test(title) || SOFT404.test(head)) out.push('soft-404');
  const a = words(anchorText), t = new Set(words(title));
  // A #section link points at part of a page, so the page title says nothing about it.
  if (!link.hash && a.length >= 2 && t.size > 0 && !a.some((w) => t.has(w))) out.push('title-mismatch');
  return out;
}

// Linear attribute parse of one bounded tag string.
function attrsOf(tag) {
  const out = {};
  for (const m of tag.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g)) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

const SRC_TAGS = new Set(['img', 'script', 'iframe', 'source', 'video', 'audio']);

// Scans tag starts with indexOf. Every pointer only moves forward, so work is linear in the body.
function extractLinks(body, pageUrl, limit = Infinity) {
  const out = [];
  const add = (raw, text, kind) => {
    const v = raw.trim().replace(/&amp;/g, '&');
    if (!v || v === '#' || SKIP.test(v)) return;
    if (/^(mailto|tel):/i.test(v)) { out.push({ url: v, text, kind }); return; }
    try { out.push({ url: new URL(v, pageUrl).href, text, kind }); } catch { out.push({ url: v, text, kind: 'bad' }); }
  };
  const lower = body.toLowerCase();
  const nameRe = /<([a-z][a-z0-9]*)/y;
  const nextA = /<a[\s>]/g;
  let i = 0, gt = -1, closeA = -1, aStart = -1;
  while (out.length < limit && (i = body.indexOf('<', i)) >= 0) {
    nameRe.lastIndex = i;
    const nm = nameRe.exec(lower);
    if (!nm) { i++; continue; }
    if (gt < i) gt = body.indexOf('>', i);
    if (gt < 0) break;
    if (gt - i > TAG_MAX) { i = gt + 1; continue; }
    const name = nm[1], a = attrsOf(body.slice(i + 1 + name.length, gt));
    i = gt + 1;
    if (name === 'a' && a.href !== undefined) {
      if (closeA < i) { closeA = lower.indexOf('</a', i); if (closeA < 0) closeA = Infinity; }
      if (aStart < i) { nextA.lastIndex = i; const n = nextA.exec(lower); aStart = n ? n.index : Infinity; }
      const text = body.slice(i, Math.min(closeA, aStart, i + TEXT_MAX)).replace(/<[^<>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      add(a.href, text, 'a');
    } else if (name === 'link' && a.href && !/\b(?:preconnect|dns-prefetch)\b/i.test(a.rel ?? '')) add(a.href, '', 'asset');
    else if (name === 'form' && a.action) add(a.action, '', 'asset');
    else if (name === 'meta' && a.property === 'og:url' && a.content) add(a.content, '', 'asset');
    if (SRC_TAGS.has(name) && a.src) add(a.src, '', 'asset');
    if (a.srcset) for (const part of a.srcset.split(',')) add(part.trim().split(/\s+/)[0], '', 'asset');
    // Script and style bodies are code, not markup: an href inside a string is not a link.
    if (name === 'script' || name === 'style') { i = lower.indexOf('</' + name, i); if (i < 0) break; }
  }
  return out;
}

// Reads at most `cap` bytes, then destroys the rest of the stream. The deadline destroys it too.
async function readCapped(res, cap, signal) {
  const chunks = [], stop = () => res.destroy(signal.reason);
  let n = 0;
  signal.addEventListener('abort', stop, { once: true });
  try {
    for await (const c of res) { chunks.push(c); n += c.length; if (n >= cap) break; }
  } finally { signal.removeEventListener('abort', stop); res.destroy(); }
  return Buffer.concat(chunks).subarray(0, cap).toString('utf8');
}

const fail = (code, msg) => Object.assign(new Error(msg), { code });

// A per-URL deadline. Its timer is ref'd, so a lookup that holds no handle of its own still
// gets its timeout; every caller clears it when done, so nothing outlives the work.
function deadline(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new DOMException(`deadline of ${ms} ms passed`, 'TimeoutError')), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}
// Settles with `p`, or rejects with the signal's reason once it aborts. The listener goes
// away either way, so a lookup that never answers keeps no reference.
function withDeadline(p, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  let stop;
  const dead = new Promise((_, no) => { stop = () => no(signal.reason); signal.addEventListener('abort', stop, { once: true }); });
  return Promise.race([p, dead]).finally(() => signal.removeEventListener('abort', stop));
}
function timed(p, ms) {
  const d = deadline(ms);
  return withDeadline(p, d.signal).finally(d.clear);
}
// A report reason for a failed fetch: any deadline reads "timeout", not a DOMException code.
const errName = (e) => ([e, e?.cause].some((x) => x?.name === 'TimeoutError') ? 'timeout' : e?.cause?.code ?? e?.code ?? e?.name ?? 'error');

// The socket's lookup: resolves every address, refuses the connection if any is blocked
// (when guarded), and hands the vetted address straight to the socket. `connectTo` is a
// test seam that rewrites the dial address after the check.
function vettedLookup(resolve, guard, connectTo, signal) {
  return (host, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    const pick = (addrs) => {
      if (guard && addrs.some((a) => blockedIp(a.address))) throw fail('EBLOCKED', `blocked address for ${host}`);
      const fam = opts.family === 4 || opts.family === 6 ? opts.family : 0;
      const list = addrs.filter((a) => !fam || a.family === fam).map((a) => ({ address: connectTo(a.address), family: a.family }));
      if (!list.length) throw fail('ENOTFOUND', `no address for ${host}`);
      return list;
    };
    withDeadline(resolve(normHost(host), { all: true }), signal).then((addrs) => {
      let list;
      try { list = pick(addrs); } catch (e) { cb(e); return; }
      if (opts.all) cb(null, list); else cb(null, list[0].address, list[0].family);
    }, cb);
  };
}

// One GET over node:http(s), no pooled sockets, so every connection runs the vetted lookup.
function send(u, lookup, signal) {
  return new Promise((ok, no) => {
    const req = (u.protocol === 'https:' ? https : http).request(u, { headers: { 'user-agent': UA }, agent: false, lookup, signal }, ok);
    req.on('error', no);
    req.end();
  });
}

// Follows redirects by hand so every hop is checked before it is fetched.
// One deadline covers every hop and the body read.
async function fetchFollow(url, { timeoutMs, guard, lookup, connectTo }) {
  const d = deadline(timeoutMs);
  try { return await follow(url, guard, lookup, vettedLookup(lookup, guard, connectTo, d.signal), d.signal); } finally { d.clear(); }
}
async function follow(url, guard, lookup, sockLookup, signal) {
  let cur = url, hops = 0;
  const hosts = [];
  for (;;) {
    const u = new URL(cur);
    if (!hosts.includes(u.hostname)) hosts.push(u.hostname);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return { refused: 'unsupported-scheme', finalUrl: cur, hops };
    if (guard && await withDeadline(resolvesPrivate(u.hostname, lookup), signal)) return { refused: 'private', finalUrl: cur, hops };
    let res;
    try { res = await send(u, sockLookup, signal); } catch (e) {
      if (e.code === 'EBLOCKED') return { refused: 'private', finalUrl: cur, hops };
      throw e;
    }
    const status = res.statusCode, loc = res.headers.location;
    if (status >= 300 && status < 400 && loc) {
      res.destroy();
      if (hops >= MAX_HOPS) return { refused: 'too-many-redirects', finalUrl: cur, hops };
      cur = new URL(loc, cur).href; hops++; continue;
    }
    const type = res.headers['content-type'] ?? '';
    let body = '';
    if (type.includes('html')) body = await readCapped(res, BODY_CAP, signal);
    else res.destroy();
    return { status, finalUrl: cur, hops, hosts, type, body, title: titleOf(body), h1: innerOf(body, 'h1') };
  }
}

// Fills a link entry for a response that was refused before fetching.
function refusedEntry(entry, r, first) {
  entry.final_url = r.finalUrl;
  if (r.refused === 'private') { entry.reasons.push('private-host', 'not fetched: private address'); return; }
  if (r.refused === 'too-many-redirects') { entry.verdict = 'BROKEN'; entry.reasons.push('too-many-redirects'); return; }
  // A link to another scheme cannot be checked here; a redirect into one is broken for a visitor.
  if (r.hops > 0 || first) entry.verdict = 'BROKEN';
  entry.reasons.push('unsupported-scheme, not fetched');
}

function anchorIds(r) {
  if (!r.ids) {
    r.ids = new Set();
    for (const m of r.body.matchAll(/\b(?:id|name)\s*=\s*["']([^"']*)["']/gi)) r.ids.add(m[1]);
  }
  return r.ids;
}

export async function checkLinks(startUrl, opts = {}) {
  const { maxPages = 50, maxLinks = 2000, browser = true, timeoutMs = 10000, maxBrowserRetries = 20 } = opts;
  const lookup = opts._lookup ?? dnsLookup, connectTo = opts._connectTo ?? ((a) => a);
  const launch = opts._launch ?? (async (o) => (await import('playwright')).chromium.launch(o));
  const start = new URL(startUrl);
  // Local dev audits stay unguarded; a public start never reaches a private address. The check
  // runs under the per-URL deadline; if it fails, the start is guarded and reports that failure.
  let startErr = null;
  const guard = !(await timed(resolvesPrivate(start.hostname, lookup), timeoutMs)
    .catch((e) => { startErr = e; return false; }));
  const pages = [], queue = [start.href], seenPages = new Set([start.href]);
  const cache = new Map(), links = [];
  if (startErr) cache.set(start.href, Promise.resolve({ error: errName(startErr) }));
  let truncated = false, browserP = null;
  const pending = [];
  const get = (u) => {
    if (!cache.has(u)) cache.set(u, fetchFollow(u, { timeoutMs, guard, lookup, connectTo }).catch((e) => ({ error: errName(e) })));
    return cache.get(u);
  };
  // Requests the guarded page makes are checked like a fetch; private ones are aborted. WebSockets
  // and browser-followed redirect hops skip this route; the resolver pin in retryAll stops those.
  const routeGuard = async (route) => {
    try {
      const u = route.request().url();
      if (/^(data|blob):/i.test(u) || await browserAllowed(u, lookup, timeoutMs)) await route.continue();
      else await route.abort('blockedbyclient');
    } catch { /* the page closed under the request; nothing left to route */ }
  };
  const visit = async (b, url) => {
    let ctx;
    try {
      ctx = await b.newContext(guard ? { serviceWorkers: 'block' } : undefined);
      const pg = await ctx.newPage();
      if (guard) await pg.route('**/*', routeGuard);
      const r = await pg.goto(url, { timeout: timeoutMs, waitUntil: 'domcontentloaded' });
      return r ? r.status() : null;
    } catch { return null; } finally { await ctx?.close().catch(() => {}); }
  };
  // Browser retries run last, in one browser. From a public start every host on the fetcher's
  // redirect chain is resolved and vetted once, and Chromium gets only those addresses: it
  // resolves names itself, so a check made outside it would be time-of-check only.
  const retryAll = async () => {
    const pins = new Map(), go = [];
    const pin = (h) => {
      if (!pins.has(h)) pins.set(h, timed(pinAddr(h, lookup), timeoutMs).catch(() => null));
      return pins.get(h);
    };
    for (const p of pending) {
      if (go.length >= maxBrowserRetries) { p.entry.reasons.push('bot-blocked, retry cap reached, no browser retry'); continue; }
      if (guard && (await Promise.all(p.hosts.map(pin))).includes(null)) {
        p.entry.reasons.push('bot-blocked, browser retry refused: private or unpinnable address'); continue;
      }
      go.push(p);
    }
    if (!go.length) return;
    const pairs = [];
    if (guard) for (const h of new Set(go.flatMap((p) => p.hosts))) pairs.push([normHost(h), await pin(h)]);
    browserP = launch(guard ? { args: [`--host-resolver-rules=${hostRules(pairs)}`, '--no-proxy-server',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] } : undefined).catch(() => null);
    const b = await browserP;
    for (const { entry, url } of go) {
      const status = b ? await visit(b, url) : null;
      if (status && status < 400) { entry.verdict = 'OK'; entry.reasons.push('ok-in-browser'); } else entry.reasons.push('bot-blocked');
    }
  };

  try {
    // The start URL is itself a link: a dead start must report, not crash.
    const first = await get(start.href);
    if (first.refused || first.error || first.status >= 400) {
      const entry = { url: start.href, page: start.href, text: '', verdict: 'OK', status: first.status ?? null, reasons: [], final_url: null };
      if (first.refused) refusedEntry(entry, first, true);
      else {
        entry.verdict = first.error ? 'BROKEN' : (BLOCK_CODES.has(first.status) ? 'BLOCKED' : 'BROKEN');
        entry.reasons.push(first.error ? `network: ${first.error}` : `http ${first.status}`);
      }
      links.push(entry);
      queue.length = 0;
    }

    crawl: while (queue.length && pages.length < maxPages) {
      const pageUrl = queue.shift();
      const res = await get(pageUrl);
      if (res.error || res.refused || !res.type.includes('html')) continue;
      pages.push(pageUrl);
      for (const { url, text, kind } of extractLinks(res.body, pageUrl, maxLinks - links.length + 1)) {
        if (links.length >= maxLinks) { truncated = true; break crawl; }
        const entry = { url, page: pageUrl, text, verdict: 'OK', status: null, reasons: [], final_url: null };
        links.push(entry);
        if (kind === 'bad') { entry.verdict = 'BROKEN'; entry.reasons.push('unparseable-url'); continue; }
        if (url.startsWith('mailto:')) { if (!MAILTO.test(url)) { entry.verdict = 'BROKEN'; entry.reasons.push('bad-mailto'); } continue; }
        if (url.startsWith('tel:')) { if (!TEL.test(url)) { entry.verdict = 'BROKEN'; entry.reasons.push('bad-tel'); } continue; }
        const u = new URL(url), rawFrag = u.hash.slice(1); u.hash = '';
        let frag;
        try { frag = decodeURIComponent(rawFrag); } catch { frag = rawFrag; }
        const r = await get(u.href);
        if (r.error) { entry.verdict = 'BROKEN'; entry.reasons.push(`network: ${r.error}`); continue; }
        if (r.refused) { refusedEntry(entry, r, false); continue; }
        entry.status = r.status; entry.final_url = r.finalUrl;
        if (BLOCK_CODES.has(r.status)) {
          entry.verdict = 'BLOCKED';
          if (browser) pending.push({ entry, url: u.href, hosts: r.hosts }); else entry.reasons.push('bot-blocked, no browser retry');
          continue;
        }
        if (r.status >= 400) { entry.verdict = 'BROKEN'; entry.reasons.push(`http ${r.status}`); continue; }
        entry.reasons.push(...destinationWarnings({ linkUrl: url, finalUrl: r.finalUrl, hops: r.hops, startUrl: start.href,
          anchorText: text, title: r.title, body: '', h1: r.h1 }));
        // A page with scripts may route the fragment itself (a JS router), so absence is a warning there.
        if (frag && r.type.includes('html') && !anchorIds(r).has(frag)) {
          if (/<script\b/i.test(r.body)) entry.reasons.push('missing-anchor-scripted');
          else { entry.verdict = 'BROKEN'; entry.reasons.push('missing-anchor'); }
        }
        if (kind === 'a' && new URL(r.finalUrl).origin === start.origin && r.type.includes('html') && !seenPages.has(u.href)) {
          seenPages.add(u.href); queue.push(u.href);
        }
      }
    }
    await retryAll();
  } finally {
    if (browserP) await (await browserP)?.close().catch(() => {});
  }
  const summary = {
    ok: links.filter((l) => l.verdict === 'OK').length,
    broken: links.filter((l) => l.verdict === 'BROKEN').length,
    blocked: links.filter((l) => l.verdict === 'BLOCKED').length,
    warned: links.filter((l) => l.verdict === 'OK' && l.reasons.some((x) => x !== 'ok-in-browser')).length,
  };
  return { start: start.href, checked_at: new Date().toISOString(), pages, links, summary, truncated };
}

async function cli(argv) {
  const args = argv.slice(2);
  const url = args.find((a) => !a.startsWith('--') && !/^\d+$/.test(a));
  const num = (flag, def) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : def; };
  const maxPages = num('--max-pages', 50), maxLinks = num('--max-links', 2000);
  const okNum = (n) => Number.isInteger(n) && n > 0 && n <= MAX_PAGES_CLI * 10;
  if (!url || !/^https?:\/\//i.test(url) || !okNum(maxPages) || maxPages > MAX_PAGES_CLI || !okNum(maxLinks)) {
    console.error(`usage: node check-links.mjs <http(s) url> [--max-pages N<=${MAX_PAGES_CLI}] [--max-links N] [--json] [--no-browser]`);
    return 2;
  }
  const report = await checkLinks(url, { maxPages, maxLinks, browser: !args.includes('--no-browser') });
  if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const l of report.links) {
      if (l.verdict !== 'OK' || l.reasons.length) console.log(`${l.verdict.padEnd(7)} ${l.url}  on ${l.page}${l.reasons.length ? `  (${l.reasons.join(', ')})` : ''}`);
    }
    const s = report.summary;
    console.log(`pages ${report.pages.length} | ok ${s.ok} | warned ${s.warned} | blocked ${s.blocked} | broken ${s.broken}`);
    if (report.truncated) console.log(`note: stopped at ${maxLinks} links; the report is partial (raise --max-links)`);
  }
  return report.summary.broken > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  cli(process.argv).then((c) => process.exit(c), (e) => { console.error(e); process.exit(2); });
}
