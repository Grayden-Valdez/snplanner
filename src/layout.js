/**
 * Page layouts. Pure JS: given the calendar model and a page, returns
 *   {
 *     ops:   [...draw ops for the background template PNG],
 *     links: [{ text, rect, fontSize, dest, bold }],   // text-link elements
 *     marks: { [dateKey]: rect },                      // where a ✓ goes for that day
 *   }
 *
 * Draw ops (all coordinates in page pixels, origin top-left):
 *   { op:'line',   x1,y1,x2,y2, w, dash }
 *   { op:'rect',   x,y,w,h, lw, fill }         // fill: gray 0..255 or null
 *   { op:'text',   x,y, text, size, align, bold, gray }   // y = top of text box
 *   { op:'circle', cx,cy,r, lw }
 *
 * The same op list is consumed by the Kotlin renderer on-device and by
 * tools/preview.py here, so what you preview is what the device draws.
 *
 * Everything is designed on a 1920 x 2560 canvas (Supernote Manta / A5 X2)
 * and scaled uniformly to the real page size.
 */

const cal = require('./calendar');

const DESIGN_W = 1920;
const DESIGN_H = 2560;

// Keep nav links below the host's top toolbar (compass used 130 on A5X).
const NAV_TOP = 150;
const NAV_H = 64;
const NAV_FONT = 34;
const MARGIN = 80;

const GRAY_LIGHT = 236;  // out-of-month cells, box headers
const GRAY_TEXT = 150;   // out-of-month day numbers
const GRAY_LINE = 120;   // writing lines

// Rough text width estimate for sizing link boxes (Roboto-ish average).
function textWidth(text, size) {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += 0.28;
    else if ('ilj|.,:;\'!'.includes(ch)) w += 0.28;
    else if ('mwMW'.includes(ch)) w += 0.85;
    else if (ch === '✓' || ch === '‹' || ch === '›') w += 0.6;
    else if (ch >= 'A' && ch <= 'Z') w += 0.68;
    else if (ch >= '0' && ch <= '9') w += 0.56;
    else w += 0.54;
  }
  return w * size;
}

class Page {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.s = W / DESIGN_W;
    this.ops = [];
    this.links = [];
    this.marks = {};
  }
  // scale helper
  S(v) { return Math.round(v * this.s); }

  line(x1, y1, x2, y2, w = 2, dash = false, gray = 0) {
    this.ops.push({ op: 'line', x1: this.S(x1), y1: this.S(y1), x2: this.S(x2), y2: this.S(y2), w: Math.max(1, this.S(w)), dash, gray });
  }
  rect(x, y, w, h, lw = 2, fill = null) {
    this.ops.push({ op: 'rect', x: this.S(x), y: this.S(y), w: this.S(w), h: this.S(h), lw: lw ? Math.max(1, this.S(lw)) : 0, fill });
  }
  text(x, y, text, size, { align = 'left', bold = false, gray = 0 } = {}) {
    this.ops.push({ op: 'text', x: this.S(x), y: this.S(y), text, size: this.S(size), align, bold, gray });
  }
  circle(cx, cy, r, lw = 2) {
    this.ops.push({ op: 'circle', cx: this.S(cx), cy: this.S(cy), r: this.S(r), lw: Math.max(1, this.S(lw)) });
  }
  /** Text link. x,y = top-left of the link box in design units. Returns box width (design units). */
  link(x, y, text, size, dest, { align = 'left', bold = false } = {}) {
    const pad = 10;
    const w = textWidth(text, size) + pad * 2;
    const h = size * 1.4;
    let left = x;
    if (align === 'center') left = x - w / 2;
    if (align === 'right') left = x - w;
    this.links.push({
      text, dest, bold,
      fontSize: this.S(size),
      rect: { left: this.S(left), top: this.S(y), right: this.S(left + w), bottom: this.S(y + h) },
    });
    return w;
  }
  /** Reserve a ✓ slot for a day. x,y = top-left, size = box side (design units). */
  mark(dateKey, x, y, size) {
    this.marks[dateKey] = {
      left: this.S(x), top: this.S(y), right: this.S(x + size), bottom: this.S(y + size),
      fontSize: this.S(size * 0.7),
    };
  }
  /** Horizontal writing lines from y to yEnd every `gap`. */
  ruled(x1, x2, y, yEnd, gap) {
    for (let yy = y; yy <= yEnd; yy += gap) this.line(x1, yy, x2, yy, 1.5, false, GRAY_LINE);
  }
  result() { return { ops: this.ops, links: this.links, marks: this.marks }; }
}

// ---------------------------------------------------------------------------
// Navigation band: parents on the left, prev/next on the right.
// Template draws the band frame and dividers; the words are link elements.
// ---------------------------------------------------------------------------
function navBand(pg, model, page) {
  const items = [];
  const { byKey } = model;
  const P = page.parents;
  if (P.year) items.push({ text: String(model.year), dest: P.year });
  if (P.quarter) items.push({ text: byKey[P.quarter].title, dest: P.quarter });
  if (P.month) items.push({ text: byKey[P.month].title, dest: P.month });
  if (P.week) items.push({ text: byKey[P.week].title, dest: P.week });

  const right = [];
  const label = (p) => (p.kind === 'day' ? p.short : p.title);
  if (page.prev) right.push({ text: `‹ ${label(byKey[page.prev])}`, dest: page.prev });
  if (page.next) right.push({ text: `${label(byKey[page.next])} ›`, dest: page.next });

  const y = NAV_TOP;
  pg.rect(MARGIN, y, DESIGN_W - 2 * MARGIN, NAV_H, 2, null);
  let x = MARGIN + 18;
  const ty = y + (NAV_H - NAV_FONT * 1.4) / 2;
  items.forEach((it, i) => {
    const w = pg.link(x, ty, it.text, NAV_FONT, it.dest);
    x += w + 18;
    if (i < items.length - 1 || right.length) pg.line(x, y + 12, x, y + NAV_H - 12, 2);
    x += 18;
  });
  // prev/next right-aligned
  let rx = DESIGN_W - MARGIN - 18;
  for (let i = right.length - 1; i >= 0; i--) {
    const w = pg.link(rx, ty, right[i].text, NAV_FONT, right[i].dest, { align: 'right' });
    rx -= w + 18;
    if (i > 0) pg.line(rx, y + 12, rx, y + NAV_H - 12, 2);
    rx -= 18;
  }
}

// ---------------------------------------------------------------------------
// Mini month grid (year + quarter pages). Day numbers are template text; the
// month title is a link; each cell reserves a ✓ slot.
// ---------------------------------------------------------------------------
function miniMonth(pg, model, month, x, y, w, h, { titleSize, headSize, numSize, link = true }) {
  const rows = cal.monthGrid(model, month);
  const wkW = Math.round(w * 0.1);
  const cellW = (w - wkW) / 7;
  const titleH = titleSize * 1.5;
  const headH = headSize * 1.6;
  const cellH = (h - titleH - headH) / 6;

  // title
  if (link) pg.link(x + w / 2, y, cal.MONTH_NAMES[month].toUpperCase(), titleSize, `M${month}`, { align: 'center', bold: true });
  else pg.text(x + w / 2, y + titleSize * 0.2, cal.MONTH_NAMES[month].toUpperCase(), titleSize, { align: 'center', bold: true });

  const gy = y + titleH;
  // header
  pg.rect(x, gy, w, headH, 1.5, GRAY_LIGHT);
  pg.text(x + wkW / 2, gy + (headH - headSize) / 2, 'Wk', headSize, { align: 'center', bold: true });
  cal.DAY_LETTER.forEach((d, c) => {
    pg.text(x + wkW + cellW * c + cellW / 2, gy + (headH - headSize) / 2, d, headSize, { align: 'center', bold: true });
  });
  // grid
  const top = gy + headH;
  pg.rect(x, top, w, cellH * 6, 1.5, null);
  for (let r = 1; r < 6; r++) pg.line(x, top + cellH * r, x + w, top + cellH * r, 1);
  pg.line(x + wkW, top, x + wkW, top + cellH * 6, 1.5);
  for (let c = 1; c < 7; c++) pg.line(x + wkW + cellW * c, top, x + wkW + cellW * c, top + cellH * 6, 1);

  rows.forEach((row, r) => {
    const ry = top + cellH * r;
    if (row.week != null) pg.text(x + wkW / 2, ry + (cellH - numSize) / 2, String(row.week), numSize, { align: 'center', bold: true });
    row.cells.forEach((cell, c) => {
      const cx = x + wkW + cellW * c;
      pg.text(cx + 5, ry + 3, String(cell.day), numSize, { gray: cell.inMonth ? 0 : GRAY_TEXT });
      if (cell.inMonth) {
        const m = Math.min(cellW, cellH) * 0.52;
        pg.mark(cell.key, cx + cellW - m - 3, ry + cellH - m - 3, m);
      }
    });
  });
}

// ---------------------------------------------------------------------------
function layoutYear(pg, model, page) {
  // Quarter links row + big year title
  const qy = NAV_TOP;
  pg.rect(MARGIN, qy, DESIGN_W - 2 * MARGIN, NAV_H, 2, null);
  const centers = [0.2, 0.4, 0.6, 0.8];
  for (let q = 1; q <= 4; q++) {
    pg.link(MARGIN + (DESIGN_W - 2 * MARGIN) * centers[q - 1], qy + (NAV_H - NAV_FONT * 1.4) / 2, `Q${q}`, NAV_FONT, `Q${q}`, { align: 'center', bold: true });
  }
  pg.text(DESIGN_W / 2, 240, String(model.year), 110, { align: 'center', bold: true });

  const cols = 3, rowsN = 4, gapX = 40, gapY = 36;
  const x0 = MARGIN, y0 = 400;
  const mw = (DESIGN_W - 2 * MARGIN - gapX * (cols - 1)) / cols;
  const mh = (DESIGN_H - y0 - 70 - gapY * (rowsN - 1)) / rowsN;
  for (let m = 0; m < 12; m++) {
    const c = m % cols, r = Math.floor(m / cols);
    miniMonth(pg, model, m, x0 + c * (mw + gapX), y0 + r * (mh + gapY), mw, mh, { titleSize: 34, headSize: 22, numSize: 22 });
  }
}

function layoutQuarter(pg, model, page) {
  navBand(pg, model, page);
  const m0 = page.months[0], m2 = page.months[2];
  pg.text(MARGIN, 240, page.title, 84, { bold: true });
  pg.text(MARGIN + 200, 282, `${cal.MONTH_NAMES[m0]} – ${cal.MONTH_NAMES[m2]} ${model.year}`, 36);

  const y0 = 380, yEnd = DESIGN_H - 90;
  const leftW = 900, gap = 50;
  const mh = (yEnd - y0 - gap * 2) / 3;
  page.months.forEach((m, i) => {
    miniMonth(pg, model, m, MARGIN, y0 + i * (mh + gap), leftW, mh, { titleSize: 38, headSize: 26, numSize: 26 });
  });
  const nx = MARGIN + leftW + 60;
  pg.text(nx, y0, 'NOTES', 32, { bold: true });
  pg.ruled(nx, DESIGN_W - MARGIN, y0 + 90, yEnd, 72);
}

function layoutMonth(pg, model, page) {
  navBand(pg, model, page);
  const m = page.month;
  pg.text(MARGIN, 236, cal.MONTH_NAMES[m].toUpperCase(), 84, { bold: true });
  pg.text(DESIGN_W - MARGIN, 282, String(model.year), 44, { align: 'right' });

  const rows = cal.monthGrid(model, m);
  const x = MARGIN, y = 380, w = DESIGN_W - 2 * MARGIN;
  const wkW = 110, headH = 60, cellH = 232;
  const cellW = (w - wkW) / 7;

  pg.rect(x, y, w, headH, 2, GRAY_LIGHT);
  pg.text(x + wkW / 2, y + (headH - 28) / 2, 'Week', 28, { align: 'center', bold: true });
  cal.DAY_NAMES.forEach((d, c) => {
    pg.text(x + wkW + cellW * c + cellW / 2, y + (headH - 28) / 2, d, 28, { align: 'center', bold: true });
  });
  const top = y + headH;
  // out-of-month shading first, then grid lines on top
  rows.forEach((row, r) => row.cells.forEach((cell, c) => {
    if (!cell.inMonth) pg.rect(x + wkW + cellW * c, top + cellH * r, cellW, cellH, 0, 246);
  }));
  pg.rect(x, top, w, cellH * 6, 2, null);
  for (let r = 1; r < 6; r++) pg.line(x, top + cellH * r, x + w, top + cellH * r, 1.5);
  pg.line(x + wkW, top, x + wkW, top + cellH * 6, 2);
  for (let c = 1; c < 7; c++) pg.line(x + wkW + cellW * c, top, x + wkW + cellW * c, top + cellH * 6, 1.5);

  rows.forEach((row, r) => {
    const ry = top + cellH * r;
    if (row.weekKey) pg.link(x + wkW / 2, ry + 10, String(row.week), 36, row.weekKey, { align: 'center', bold: true });
    row.cells.forEach((cell, c) => {
      const cx = x + wkW + cellW * c;
      // Every cell links to its day page (spill days too, if they exist).
      if (model.byKey[cell.key]) {
        pg.link(cx + 6, ry + 6, String(cell.day), 30, cell.key);
        pg.mark(cell.key, cx + cellW - 54, ry + cellH - 54, 48);
      } else {
        pg.text(cx + 14, ry + 10, String(cell.day), 30, { gray: GRAY_TEXT });
      }
    });
  });

  // To-do's | Notes
  const by = top + cellH * 6 + 50;
  const mid = DESIGN_W / 2;
  pg.text((x + mid) / 2, by, "TO DO'S", 32, { align: 'center', bold: true });
  pg.text((mid + DESIGN_W - MARGIN) / 2, by, 'NOTES', 32, { align: 'center', bold: true });
  pg.line(mid, by, mid, DESIGN_H - 90, 2);
  pg.ruled(x, mid - 40, by + 110, DESIGN_H - 90, 70);
  pg.ruled(mid + 40, DESIGN_W - MARGIN, by + 110, DESIGN_H - 90, 70);
}

function layoutWeek(pg, model, page) {
  navBand(pg, model, page);
  pg.text(MARGIN, 236, `WEEK ${page.week}`, 84, { bold: true });
  pg.text(DESIGN_W - MARGIN, 282, page.subtitle, 40, { align: 'right' });

  // 3 columns x 3 rows: Sun Mon Tue / Wed Thu Fri / Sat + Notes (2 cols)
  const x0 = MARGIN, y0 = 380, gap = 40;
  const colW = (DESIGN_W - 2 * MARGIN - gap * 2) / 3;
  const rowH = (DESIGN_H - y0 - 90 - gap * 2) / 3;
  const block = (col, row, span, dayKey) => {
    const x = x0 + col * (colW + gap);
    const y = y0 + row * (rowH + gap);
    const w = colW * span + gap * (span - 1);
    const headH = 64;
    pg.rect(x, y, w, headH, 0, GRAY_LIGHT);
    pg.line(x, y + headH, x + w, y + headH, 2);
    if (dayKey) {
      const d = model.byKey[dayKey];
      const dow = d.date.getUTCDay();
      pg.link(x + 10, y + 9, `${cal.DAY_NAMES[dow]} ${d.date.getUTCDate()}`, 34, dayKey, { bold: true });
      pg.mark(dayKey, x + w - 58, y + 8, 48);
    } else {
      pg.text(x + 14, y + 14, 'NOTES', 34, { bold: true });
    }
    pg.ruled(x, x + w, y + headH + 74, y + rowH - 6, 74);
  };
  const d = page.days;
  block(0, 0, 1, d[0]); block(1, 0, 1, d[1]); block(2, 0, 1, d[2]);
  block(0, 1, 1, d[3]); block(1, 1, 1, d[4]); block(2, 1, 1, d[5]);
  block(0, 2, 1, d[6]); block(1, 2, 2, null);
}

function layoutDay(pg, model, page) {
  navBand(pg, model, page);
  pg.text(MARGIN, 240, page.title, 56, { bold: true });
  pg.line(MARGIN, 330, DESIGN_W - MARGIN, 330, 3);

  // Left column: To-do's then Notes
  const lx = MARGIN, lr = 900;
  pg.text(lx, 360, "TO DO'S", 34, { bold: true });
  let y = 420;
  const rowH = 66;
  for (let i = 0; i < 12; i++) {
    pg.circle(lx + 24, y + rowH / 2, 15, 2.5);
    pg.line(lx + 56, y + rowH - 6, lr, y + rowH - 6, 1.5, false, GRAY_LINE);
    y += rowH;
  }
  y += 40;
  pg.text(lx, y, 'NOTES', 34, { bold: true });
  pg.ruled(lx, lr, y + 110, DESIGN_H - 90, 70);

  // Right column: schedule then gratitude
  const rx = 960, rr = DESIGN_W - MARGIN;
  pg.text(rx, 360, 'SCHEDULE', 34, { bold: true });
  const sy = 420, hourH = 104, hours = [];
  for (let h = 7; h <= 19; h++) hours.push(h);
  pg.rect(rx, sy, rr - rx, hourH * hours.length, 2, null);
  hours.forEach((h, i) => {
    const hy = sy + hourH * i;
    if (i > 0) pg.line(rx, hy, rr, hy, 1.5);
    pg.line(rx + 70, hy + hourH / 2, rr, hy + hourH / 2, 1, true, GRAY_LINE);
    const lbl = h > 12 ? String(h - 12) : String(h);
    pg.text(rx + 36, hy + 8, lbl, 30, { align: 'center', bold: true });
    pg.text(rx + 36, hy + 50, h >= 12 ? 'pm' : 'am', 18, { align: 'center', gray: GRAY_TEXT });
  });
  pg.line(rx + 70, sy, rx + 70, sy + hourH * hours.length, 1.5);

  const gy = sy + hourH * hours.length + 60;
  const gh = DESIGN_H - 90 - gy;
  pg.rect(rx, gy, rr - rx, gh, 2, null);
  pg.rect(rx, gy, rr - rx, 60, 0, GRAY_LIGHT);
  pg.line(rx, gy + 60, rr, gy + 60, 2);
  pg.text(rx + (rr - rx) / 2, gy + 14, 'GOOD THINGS & GRATITUDE TODAY', 30, { align: 'center', bold: true });
  const n = 3, slot = (gh - 60) / n;
  for (let i = 0; i < n; i++) {
    const yy = gy + 60 + slot * i;
    pg.text(rx + 16, yy + 18, `${i + 1})`, 26, { bold: true });
    pg.line(rx + 60, yy + slot * 0.5, rr - 16, yy + slot * 0.5, 1.5, false, GRAY_LINE);
    pg.line(rx + 60, yy + slot * 0.88, rr - 16, yy + slot * 0.88, 1.5, false, GRAY_LINE);
  }
}

const LAYOUTS = { year: layoutYear, quarter: layoutQuarter, month: layoutMonth, week: layoutWeek, day: layoutDay };

function layoutPage(model, page, W = DESIGN_W, H = DESIGN_H) {
  const pg = new Page(W, H);
  LAYOUTS[page.kind](pg, model, page);
  return pg.result();
}

module.exports = { layoutPage, DESIGN_W, DESIGN_H, textWidth };
