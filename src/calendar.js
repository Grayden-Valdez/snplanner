// Coded with Claude (https://claude.com/claude-code). No human wrote a line of this — review accordingly before relying on it.
/**
 * Calendar model for the planner. Pure JS, no RN imports, so it can run in
 * node for previews and tests.
 *
 * Page order in the note:
 *   [Year] [Q1..Q4] [Jan..Dec] then, chronologically,
 *   [Week 1] [7 day pages] [Week 2] [7 day pages] ...
 *
 * Weeks start on Sunday. Week 1 is the week that contains Jan 1. The first
 * and last weeks may spill into the neighbouring years; those spill days get
 * day pages too so every week page has seven children.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3));
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = DAY_NAMES.map((d) => d.slice(0, 3));
const DAY_LETTER = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

const MS_DAY = 86400000;

// All date math in UTC so DST never shifts a day.
function utc(y, m, d) {
  return new Date(Date.UTC(y, m, d));
}
function addDays(date, n) {
  return new Date(date.getTime() + n * MS_DAY);
}
function dateKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function daysInMonth(y, m) {
  return utc(y, m + 1, 0).getUTCDate();
}
function sundayOnOrBefore(date) {
  return addDays(date, -date.getUTCDay());
}

/**
 * Builds the page list for a year.
 * Returns { year, pages, byKey } where pages[i].index === i.
 *
 * Page kinds and their fields:
 *   year    { kind, year }
 *   quarter { kind, q (1..4), months: [m0, m1, m2] (0-based) }
 *   month   { kind, month (0-based), q }
 *   week    { kind, week (1-based), start: Date, days: [dateKey x7] }
 *   day     { kind, date: Date, key, week, inYear }
 *
 * Every page has: index, key (unique string), title, prev/next (keys or
 * null) and parents: { week?, month, quarter, year } (keys).
 */
function buildYear(year) {
  const pages = [];
  const byKey = {};
  const push = (p) => {
    p.index = pages.length;
    pages.push(p);
    byKey[p.key] = p;
    return p;
  };

  push({ kind: 'year', key: `Y${year}`, year, title: String(year), prev: null, next: null, parents: {} });

  for (let q = 1; q <= 4; q++) {
    push({
      kind: 'quarter', key: `Q${q}`, q, year,
      months: [(q - 1) * 3, (q - 1) * 3 + 1, (q - 1) * 3 + 2],
      title: `Q${q}`,
      prev: q > 1 ? `Q${q - 1}` : null,
      next: q < 4 ? `Q${q + 1}` : null,
      parents: { year: `Y${year}` },
    });
  }

  for (let m = 0; m < 12; m++) {
    const q = Math.floor(m / 3) + 1;
    push({
      kind: 'month', key: `M${m}`, month: m, q, year,
      title: MONTH_NAMES[m],
      prev: m > 0 ? `M${m - 1}` : null,
      next: m < 11 ? `M${m + 1}` : null,
      parents: { quarter: `Q${q}`, year: `Y${year}` },
    });
  }

  // Weeks: from the Sunday on/before Jan 1 through the Saturday on/after Dec 31.
  const firstSunday = sundayOnOrBefore(utc(year, 0, 1));
  const lastDay = utc(year, 11, 31);
  const weeks = [];
  for (let start = firstSunday, w = 1; start <= lastDay; start = addDays(start, 7), w++) {
    const days = [];
    for (let i = 0; i < 7; i++) days.push(dateKey(addDays(start, i)));
    weeks.push({ week: w, start, days });
  }
  const nWeeks = weeks.length;

  weeks.forEach(({ week, start, days }) => {
    // The month a week "belongs" to: month of its Thursday (ISO-ish rule),
    // clamped to this year so the spill weeks still have in-year parents.
    const anchor = addDays(start, 4);
    let am = anchor.getUTCMonth();
    if (anchor.getUTCFullYear() < year) am = 0;
    if (anchor.getUTCFullYear() > year) am = 11;
    const end = addDays(start, 6);
    push({
      kind: 'week', key: `W${week}`, week, start, days, year,
      title: `Week ${week}`,
      subtitle: `${MONTH_SHORT[start.getUTCMonth()]} ${start.getUTCDate()} – ${MONTH_SHORT[end.getUTCMonth()]} ${end.getUTCDate()}, ${end.getUTCFullYear()}`,
      prev: week > 1 ? `W${week - 1}` : null,
      next: week < nWeeks ? `W${week + 1}` : null,
      parents: { month: `M${am}`, quarter: `Q${Math.floor(am / 3) + 1}`, year: `Y${year}` },
    });
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      const inYear = date.getUTCFullYear() === year;
      let m = date.getUTCMonth();
      if (date.getUTCFullYear() < year) m = 0;
      if (date.getUTCFullYear() > year) m = 11;
      const key = dateKey(date);
      const prevKey = (week === 1 && i === 0) ? null : dateKey(addDays(date, -1));
      const nextKey = (week === nWeeks && i === 6) ? null : dateKey(addDays(date, 1));
      push({
        kind: 'day', key, date, week, inYear, year,
        title: `${DAY_NAMES[i]}, ${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`,
        short: `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`,
        prev: prevKey,
        next: nextKey,
        parents: { week: `W${week}`, month: `M${m}`, quarter: `Q${Math.floor(m / 3) + 1}`, year: `Y${year}` },
      });
    }
  });

  return { year, pages, byKey, weeks };
}

/**
 * Month grid helper: returns 6 rows x 7 cells for a month, each cell
 * { key, day, inMonth, date } plus the week number per row. Rows past the
 * last day of the month are still filled (next month's days) so grids are
 * always 6 rows, like the reference planner.
 */
function monthGrid(model, month) {
  const { year, weeks } = model;
  const first = utc(year, month, 1);
  const gridStart = sundayOnOrBefore(first);
  const rows = [];
  for (let r = 0; r < 6; r++) {
    const rowStart = addDays(gridStart, r * 7);
    const wk = weeks.find((w) => w.start.getTime() === rowStart.getTime());
    const cells = [];
    for (let c = 0; c < 7; c++) {
      const date = addDays(rowStart, c);
      cells.push({
        key: dateKey(date),
        day: date.getUTCDate(),
        inMonth: date.getUTCMonth() === month && date.getUTCFullYear() === year,
        date,
      });
    }
    rows.push({ week: wk ? wk.week : null, weekKey: wk ? `W${wk.week}` : null, cells });
  }
  return rows;
}

module.exports = {
  MONTH_NAMES, MONTH_SHORT, DAY_NAMES, DAY_SHORT, DAY_LETTER,
  buildYear, monthGrid, dateKey, daysInMonth, utc, addDays,
};
