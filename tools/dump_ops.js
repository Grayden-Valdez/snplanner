#!/usr/bin/env node
// Coded with Claude (https://claude.com/claude-code). No human wrote a line of this — review accordingly before relying on it.
/**
 * Dumps layout ops + links for selected pages as JSON, for tools/preview.py.
 *   node tools/dump_ops.js 2027 out.json Y2027 Q2 M5 W23 2027-06-06
 */
const fs = require('fs');
const path = require('path');
const { buildYear } = require('../src/calendar');
const { layoutPage, DESIGN_W, DESIGN_H } = require('../src/layout');

const [year, out, ...keys] = process.argv.slice(2);
const model = buildYear(Number(year));
const W = Number(process.env.PAGE_W || DESIGN_W);
const H = Number(process.env.PAGE_H || DESIGN_H);
const pages = (keys.length ? keys : ['Y' + year, 'Q2', 'M5', 'W23', model.pages.find((p) => p.kind === 'day').key])
  .map((k) => {
    const page = model.byKey[k];
    if (!page) throw new Error('no page ' + k);
    const r = layoutPage(model, page, W, H);
    return { key: k, kind: page.kind, index: page.index, ...r };
  });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ W, H, totalPages: model.pages.length, pages }));
console.log(`wrote ${pages.length} pages (${model.pages.length} in note) to ${out}`);
