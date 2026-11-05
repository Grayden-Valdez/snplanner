#!/usr/bin/env node
/** Sanity checks for the calendar model and layouts across several years. */
const assert = require('assert');
const { buildYear, monthGrid } = require('../src/calendar');
const { layoutPage, DESIGN_W, DESIGN_H } = require('../src/layout');

for (const year of [2024, 2026, 2027, 2028, 2032]) {
  const model = buildYear(year);
  const { pages, byKey } = model;
  const days = pages.filter((p) => p.kind === 'day');
  const weeks = pages.filter((p) => p.kind === 'week');

  assert.strictEqual(pages.length, 1 + 4 + 12 + weeks.length + days.length);
  assert.strictEqual(days.length, weeks.length * 7);
  pages.forEach((p, i) => assert.strictEqual(p.index, i));

  // prev/next are symmetric and stay within kind
  for (const p of pages) {
    if (p.prev) { assert.strictEqual(byKey[p.prev].next, p.key); assert.strictEqual(byKey[p.prev].kind, p.kind); }
    if (p.next) { assert.strictEqual(byKey[p.next].prev, p.key); assert.strictEqual(byKey[p.next].kind, p.kind); }
    for (const k of Object.values(p.parents)) assert.ok(byKey[k], `${p.key} parent ${k}`);
  }
  // every in-year date exists exactly once
  const inYear = days.filter((d) => d.inYear);
  assert.strictEqual(inYear.length, (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365);
  assert.strictEqual(byKey[`${year}-01-01`].week, 1);
  // day order within the note is chronological, and days follow their week page
  for (const w of weeks) {
    w.days.forEach((k, i) => assert.strictEqual(byKey[k].index, w.index + 1 + i));
  }
  // month grids cover all month days
  for (let m = 0; m < 12; m++) {
    const cells = monthGrid(model, m).flatMap((r) => r.cells).filter((c) => c.inMonth);
    assert.strictEqual(cells.length, new Date(Date.UTC(year, m + 1, 0)).getUTCDate());
  }

  // layouts: run every page, check links resolve and rects are on-page
  let links = 0, marks = 0;
  for (const p of pages) {
    const r = layoutPage(model, p, DESIGN_W, DESIGN_H);
    for (const l of r.links) {
      assert.ok(byKey[l.dest], `${p.key}: link to missing ${l.dest}`);
      assert.ok(l.rect.left >= 0 && l.rect.right <= DESIGN_W && l.rect.top >= 0 && l.rect.bottom <= DESIGN_H, `${p.key}: link ${l.text} off page`);
      assert.ok(l.rect.right > l.rect.left && l.rect.bottom > l.rect.top);
    }
    for (const [k, m] of Object.entries(r.marks)) {
      assert.ok(byKey[k], `${p.key}: mark for missing day ${k}`);
      assert.ok(m.right <= DESIGN_W && m.bottom <= DESIGN_H, `${p.key}: mark ${k} off page`);
    }
    // every page except the year page links back to all its parents and prev/next
    if (p.kind !== 'year') {
      const dests = new Set(r.links.map((l) => l.dest));
      for (const k of Object.values(p.parents)) assert.ok(dests.has(k), `${p.key} lacks parent link ${k}`);
      if (p.prev) assert.ok(dests.has(p.prev), `${p.key} lacks prev link`);
      if (p.next) assert.ok(dests.has(p.next), `${p.key} lacks next link`);
    }
    // overview pages carry a mark slot for every in-year day they show
    if (p.kind === 'week') p.days.forEach((k) => assert.ok(r.marks[k], `${p.key} lacks mark ${k}`));
    if (p.kind === 'year') assert.strictEqual(Object.keys(r.marks).length, inYear.length);
    links += r.links.length; marks += Object.keys(r.marks).length;
  }
  // scaled layout (Nomad) stays on-page too
  const small = layoutPage(model, byKey[`M${0}`], 1404, 1872);
  for (const l of small.links) assert.ok(l.rect.right <= 1404 && l.rect.bottom <= 1872);

  console.log(`${year}: ${pages.length} pages, ${weeks.length} weeks, ${links} links, ${marks} mark slots — ok`);
}
console.log('all checks passed');
