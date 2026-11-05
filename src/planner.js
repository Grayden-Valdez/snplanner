/**
 * Planner core (runs on the device).
 *
 *   createPlanner(year, onProgress)  — builds "Note/Planner <year>.note"
 *   syncMarks(scope, onProgress)     — adds/removes ✓ links on parent pages
 *
 * Phases of createPlanner:
 *   1. Render one template PNG per page into MyStyle/Planner <year>/ via the
 *      PlannerRender native module (ops come from src/layout.js).
 *   2. createNote + insertNotePage for every page, in model order.
 *   3. Insert the navigation / day-cell text-link elements on every page.
 *   4. Record the planner in <pluginDir>/planners.json so syncMarks can
 *      recognise it later.
 *
 * @format
 */

import { NativeModules } from 'react-native';
import {
  FileUtils,
  PluginCommAPI,
  PluginFileAPI,
  PluginManager,
  PluginNoteAPI,
} from 'sn-plugin-lib';
import { buildYear, monthGrid } from './calendar';
import { layoutPage, DESIGN_W, DESIGN_H } from './layout';

const TYPE_LINK = 600;
const TYPE_STROKE = 0;
const LINK_TYPE_NOTE_PAGE = 0;
const LINK_STYLE_UNDERLINE = 0;
const MARK_TEXT = '✓';

// Known page sizes by PluginManager.getDeviceType() (used only as a first
// guess; the real size is read back from the note and templates re-rendered
// if it differs).
const DEVICE_SIZES = {
  0: { width: 1404, height: 1872 }, // A5
  1: { width: 1404, height: 1872 }, // A6
  2: { width: 1404, height: 1872 }, // A6X
  3: { width: 1404, height: 1872 }, // A5X
  4: { width: 1404, height: 1872 }, // A6X2 (Nomad)
  5: { width: 1920, height: 2560 }, // A5X2 (Manta)
};

function unwrap(value, what) {
  if (!value || !value.success) {
    throw new Error((value && value.error && value.error.message) || `${what} failed`);
  }
  return value.result;
}

function dirname(p) {
  const i = p.lastIndexOf('/');
  return i > 0 ? p.slice(0, i) : p;
}

async function firstExisting(candidates) {
  for (const c of candidates) {
    try {
      if (await FileUtils.exists(c)) return c;
    } catch {
      // ignore
    }
  }
  return null;
}

/** Resolves the Supernote root folders: { root, noteDir, styleDir }. */
async function resolveRoots() {
  const exportDir = (await FileUtils.getExportPath()) || '';
  const trimmed = exportDir.replace(/\/+$/, '');
  const roots = [dirname(trimmed)];
  try {
    const ext = await FileUtils.getExternalDirPath();
    if (Array.isArray(ext)) {
      for (const e of ext) {
        roots.push(e.replace(/\/+$/, ''));
        roots.push(`${e.replace(/\/+$/, '')}/Supernote`);
      }
    }
  } catch {
    // ignore
  }
  const styleDir = await firstExisting(roots.map((r) => `${r}/MyStyle`));
  const noteDir = await firstExisting(roots.map((r) => `${r}/Note`));
  if (!styleDir || !noteDir) {
    throw new Error(`cannot locate MyStyle/Note folders (export dir: ${exportDir})`);
  }
  return { root: dirname(styleDir), noteDir, styleDir };
}

async function pluginFile(name) {
  const dir = await PluginManager.getPluginDirPath();
  if (!dir) throw new Error('cannot resolve plugin directory');
  return `${dir.replace(/\/+$/, '')}/${name}`;
}

// Registry of planners this plugin created: { [notePath]: { year, total, width, height } }
async function readRegistry() {
  try {
    const path = await pluginFile('planners.json');
    if (!(await FileUtils.exists(path))) return {};
    const txt = await readTextFile(path);
    return txt ? JSON.parse(txt) : {};
  } catch {
    return {};
  }
}

async function writeRegistry(reg) {
  const path = await pluginFile('planners.json');
  await writeTextFile(path, JSON.stringify(reg));
}

// FileUtils has no text read/write; go through the native module which has
// plain java.io access to the plugin dir.
async function readTextFile(path) {
  return NativeModules.PlannerRender.readText(path);
}
async function writeTextFile(path, text) {
  return NativeModules.PlannerRender.writeText(path, text);
}

function templatePath(styleDir, year, page) {
  return `${styleDir}/Planner ${year}/${year}-${String(page.index).padStart(3, '0')}-${page.key}.png`;
}
function templateName(path) {
  return path.split('/').pop().replace(/\.png$/i, '');
}

async function renderTemplate(model, page, W, H, outPath) {
  const { ops } = layoutPage(model, page, W, H);
  await NativeModules.PlannerRender.renderPng(ops, W, H, outPath);
}

/**
 * insertNotePage / createNote accept a template "name" or "path" depending
 * on firmware. Try path first, then name; remember what worked.
 */
const tplStrategy = { mode: null };
async function insertPageWithTemplate(notePath, pageIndex, tplPath) {
  const attempts = tplStrategy.mode
    ? [tplStrategy.mode]
    : ['path', 'name'];
  let lastErr = '';
  for (const mode of attempts) {
    const template = mode === 'path' ? tplPath : templateName(tplPath);
    const res = await PluginFileAPI.insertNotePage({ notePath, page: pageIndex, template });
    if (res && res.success && res.result !== false) {
      tplStrategy.mode = mode;
      return;
    }
    lastErr = (res && res.error && res.error.message) || `insertNotePage(${mode}) failed`;
  }
  throw new Error(`page ${pageIndex}: ${lastErr}`);
}

/** Builds a link Element for insertElements. */
async function makeLink(pageIndex, rect, fontSize, text, destPage, notePath) {
  const el = unwrap(await PluginCommAPI.createElement(TYPE_LINK), 'createElement(link)');
  el.type = TYPE_LINK;
  el.pageNum = pageIndex;
  el.link = {
    category: 0,
    X: rect.left,
    Y: rect.top,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    page: pageIndex,
    style: LINK_STYLE_UNDERLINE,
    linkType: LINK_TYPE_NOTE_PAGE,
    destPath: notePath,
    destPage,
    fontSize,
    fullText: text,
    showText: text,
    italic: 0,
    controlTrailNums: [],
  };
  return el;
}

async function insertPageLinks(model, page, notePath, W, H) {
  const { links } = layoutPage(model, page, W, H);
  if (!links.length) return;
  const els = [];
  for (const l of links) {
    const dest = model.byKey[l.dest];
    if (!dest) continue;
    els.push(await makeLink(page.index, l.rect, l.fontSize, l.text, dest.index, notePath));
  }
  try {
    unwrap(await PluginFileAPI.insertElements(notePath, page.index, els), `insertElements(page ${page.index})`);
  } finally {
    try { PluginCommAPI.clearElementCache(); } catch { /* best effort */ }
  }
}

/**
 * Creates the planner note. onProgress(stage, done, total) is called often.
 * Returns { notePath, pages }.
 */
export async function createPlanner(year, onProgress = () => {}) {
  const model = buildYear(year);
  const total = model.pages.length;
  const { noteDir, styleDir } = await resolveRoots();
  const notePath = `${noteDir}/Planner ${year}.note`;
  if (await FileUtils.exists(notePath)) {
    throw new Error(`"Planner ${year}.note" already exists in Note — rename or delete it first`);
  }
  await FileUtils.makeDir(`${styleDir}/Planner ${year}`);

  try { PluginCommAPI.setSystemDormancyState(true); } catch { /* ignore */ }
  try {
    // --- Phase 1: first page + size probe -----------------------------------
    let devType = 5;
    try { devType = await PluginManager.getDeviceType(); } catch { /* ignore */ }
    let { width: W, height: H } = DEVICE_SIZES[devType] || DEVICE_SIZES[5];

    const yearPage = model.pages[0];
    const yearTpl = templatePath(styleDir, year, yearPage);
    onProgress('Rendering templates', 0, total);
    await renderTemplate(model, yearPage, W, H, yearTpl);

    // createNote: try template path then name.
    let created = false, lastErr = '';
    for (const template of [yearTpl, templateName(yearTpl)]) {
      const res = await PluginFileAPI.createNote({ notePath, template, mode: 0, isPortrait: true });
      if (res && res.success && res.result !== false) { created = true; break; }
      lastErr = (res && res.error && res.error.message) || 'createNote failed';
    }
    if (!created) throw new Error(`createNote: ${lastErr}`);

    const size = unwrap(await PluginFileAPI.getPageSize(notePath, 0), 'getPageSize');
    if (size.width !== W || size.height !== H) {
      // Device pages are a different size than guessed: re-render page 0.
      W = size.width; H = size.height;
      await renderTemplate(model, yearPage, W, H, yearTpl);
    }

    // --- Phase 2: render remaining templates and append pages ---------------
    for (let i = 1; i < total; i++) {
      const page = model.pages[i];
      const tpl = templatePath(styleDir, year, page);
      await renderTemplate(model, page, W, H, tpl);
      await insertPageWithTemplate(notePath, i, tpl);
      if (i % 5 === 0) onProgress('Building pages', i, total);
    }
    const count = unwrap(await PluginFileAPI.getNoteTotalPageNum(notePath), 'getNoteTotalPageNum');
    if (count !== total) throw new Error(`expected ${total} pages, note has ${count}`);

    // --- Phase 3: links -----------------------------------------------------
    for (let i = 0; i < total; i++) {
      await insertPageLinks(model, model.pages[i], notePath, W, H);
      if (i % 5 === 0) onProgress('Adding links', i, total);
    }

    // --- Phase 4: registry --------------------------------------------------
    const reg = await readRegistry();
    reg[notePath] = { year, total, width: W, height: H };
    await writeRegistry(reg);
    onProgress('Done', total, total);
    return { notePath, pages: total };
  } finally {
    try { PluginCommAPI.setSystemDormancyState(false); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Sync ✓ marks
// ---------------------------------------------------------------------------

/** Finds the planner model for the currently open note. */
async function currentPlanner() {
  const notePath = unwrap(await PluginCommAPI.getCurrentFilePath(), 'getCurrentFilePath');
  const reg = await readRegistry();
  let info = reg[notePath];
  if (!info) {
    // The note may have been moved/renamed; match on page count + file name year.
    const m = /(\d{4})/.exec(notePath.split('/').pop() || '');
    const count = unwrap(await PluginFileAPI.getNoteTotalPageNum(notePath), 'getNoteTotalPageNum');
    if (m) {
      const year = Number(m[1]);
      if (buildYear(year).pages.length === count) {
        const size = unwrap(await PluginFileAPI.getPageSize(notePath, 0), 'getPageSize');
        info = { year, total: count, width: size.width, height: size.height };
      }
    }
    if (!info) throw new Error('the open note is not a planner made by this plugin');
  }
  return { notePath, model: buildYear(info.year), W: info.width, H: info.height };
}

async function pageElements(notePath, page) {
  try {
    const els = unwrap(await PluginFileAPI.getElements(page, notePath), `getElements(${page})`);
    return Array.isArray(els) ? els : [];
  } finally {
    try { PluginCommAPI.clearElementCache(); } catch { /* best effort */ }
  }
}

/**
 * scope: 'all' | 'month'. 'month' = the month the current page belongs to
 * (its 6 grid weeks and their days) plus that month's parents.
 */
export async function syncMarks(scope, onProgress = () => {}) {
  const { notePath, model, W, H } = await currentPlanner();
  const { byKey, pages } = model;

  // Save first: the file APIs operate on disk.
  try { await PluginNoteAPI.saveCurrentNote(); } catch { /* ignore */ }

  // Which day pages to scan and which parent pages to update.
  let dayPages, parentPages;
  if (scope === 'month') {
    const cur = unwrap(await PluginCommAPI.getCurrentPageNum(), 'getCurrentPageNum');
    const p = pages[cur] || pages[0];
    const monthKey = p.kind === 'month' ? p.key : p.kind === 'year' || p.kind === 'quarter'
      ? `M${new Date().getMonth()}` : p.parents.month;
    const month = byKey[monthKey].month;
    const dayKeys = new Set();
    monthGrid(model, month).forEach((row) => row.cells.forEach((c) => byKey[c.key] && dayKeys.add(c.key)));
    dayPages = [...dayKeys].map((k) => byKey[k]);
    const parentKeys = new Set();
    for (const d of dayPages) for (const k of Object.values(d.parents)) parentKeys.add(k);
    parentPages = [...parentKeys].map((k) => byKey[k]);
  } else {
    dayPages = pages.filter((p) => p.kind === 'day');
    parentPages = pages.filter((p) => p.kind !== 'day');
  }

  try { PluginCommAPI.setSystemDormancyState(true); } catch { /* ignore */ }
  let added = 0, removed = 0;
  try {
    // 1. Which days have ink?
    const inked = new Set();
    for (let i = 0; i < dayPages.length; i++) {
      const d = dayPages[i];
      const els = await pageElements(notePath, d.index);
      if (els.some((e) => e && e.type === TYPE_STROKE)) inked.add(d.key);
      if (i % 10 === 0) onProgress('Scanning days', i, dayPages.length);
    }

    // 2. Reconcile marks on each parent page.
    for (let i = 0; i < parentPages.length; i++) {
      const parent = parentPages[i];
      const { marks } = layoutPage(model, parent, W, H);
      const els = await pageElements(notePath, parent.index);
      const existing = new Map(); // destPage -> numInPage
      for (const e of els) {
        if (e && e.type === TYPE_LINK && e.link && e.link.showText === MARK_TEXT) {
          existing.set(e.link.destPage, e.numInPage);
        }
      }
      const toAdd = [];
      const toDelete = [];
      for (const [dateKey, rect] of Object.entries(marks)) {
        const day = byKey[dateKey];
        if (!day) continue;
        const want = inked.has(dateKey);
        const has = existing.has(day.index);
        if (want && !has) toAdd.push(await makeLink(parent.index, rect, rect.fontSize, MARK_TEXT, day.index, notePath));
        if (!want && has && (scope === 'all' || dayPages.includes(day))) toDelete.push(existing.get(day.index));
      }
      if (toDelete.length) {
        unwrap(await PluginFileAPI.deleteElements(notePath, parent.index, toDelete), `deleteElements(${parent.index})`);
        removed += toDelete.length;
      }
      if (toAdd.length) {
        try {
          unwrap(await PluginFileAPI.insertElements(notePath, parent.index, toAdd), `insertElements(${parent.index})`);
        } finally {
          try { PluginCommAPI.clearElementCache(); } catch { /* best effort */ }
        }
        added += toAdd.length;
      }
      onProgress('Updating marks', i, parentPages.length);
    }
    try { await PluginCommAPI.reloadFile(); } catch { /* ignore */ }
    return { added, removed, inked: inked.size, scanned: dayPages.length };
  } finally {
    try { PluginCommAPI.setSystemDormancyState(false); } catch { /* ignore */ }
  }
}
