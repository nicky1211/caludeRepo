(() => {
  'use strict';

  const STORAGE_KEY = 'notebook-app-v1';
  // macOS system colours, used for section labels.
  const SECTION_COLORS = ['#af52de', '#007aff', '#34c759', '#ff9500', '#ff2d55', '#ffcc00', '#5ac8fa', '#5856d6'];
  const COLOR_NAMES = ['Purple', 'Blue', 'Green', 'Orange', 'Pink', 'Yellow', 'Teal', 'Indigo'];
  const HIGHLIGHT = '#ffe066';
  const TEXT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
  const EMPTY_NOTE_HTML = '<p><br></p>';

  const $ = (id) => document.getElementById(id);
  const el = {
    app: $('app'),
    toggleSidebarBtn: $('toggleSidebarBtn'),
    sidebar: $('sidebar'),
    notebookBtn: $('notebookBtn'),
    notebookName: $('notebookName'),
    searchInput: $('searchInput'),
    importInput: $('importInput'),
    toolbar: $('toolbar'),
    headingBtn: $('headingBtn'),
    overflowBtn: $('overflowBtn'),
    colorBar: $('colorBar'),
    fontColor: $('fontColor'),
    imageInput: $('imageInput'),
    sectionList: $('sectionList'),
    addSectionBtn: $('addSectionBtn'),
    pageList: $('pageList'),
    pagesHeader: $('pagesHeader'),
    pagesCount: $('pagesCount'),
    addPageBtn: $('addPageBtn'),
    searchResults: $('searchResults'),
    sidebarSplitter: $('sidebarSplitter'),
    pagesSplitter: $('pagesSplitter'),
    pageTitle: $('pageTitle'),
    pageMeta: $('pageMeta'),
    canvas: $('canvas'),
    emptyState: $('emptyState'),
    contextMenu: $('contextMenu'),
    tooltip: $('tooltip'),
    liveRegion: $('liveRegion'),
    placeDialog: $('placeDialog'),
    placeHeading: $('placeHeading'),
    placeNameRow: $('placeNameRow'),
    placeName: $('placeName'),
    placeFilter: $('placeFilter'),
    placeList: $('placeList'),
    placeOk: $('placeOk'),
    textDialog: $('textDialog'),
    textHeading: $('textHeading'),
    textValue: $('textValue'),
    confirmDialog: $('confirmDialog'),
    confirmHeading: $('confirmHeading'),
    confirmDetail: $('confirmDetail'),
    confirmOk: $('confirmOk'),
    confirmCancel: $('confirmCancel'),
  };

  // ---------- Platform ----------

  // In the desktop app data lives in a file (via electron/preload.js); in a browser it uses localStorage.
  const desktop = window.notebookDesktop || null;
  const isMac = desktop ? desktop.platform === 'darwin' : /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  document.body.classList.add(isMac ? 'mac' : 'other', desktop ? 'desktop' : 'web');

  // Formats "shift+cmd+n" as ⇧⌘N on a Mac and Ctrl+Shift+N elsewhere.
  function formatKeys(spec) {
    if (!spec) return '';
    const parts = spec.split('+');
    const key = parts.pop();
    const keyLabel = { backspace: isMac ? '\u232B' : 'Backspace', '=': '+', enter: isMac ? '\u21A9' : 'Enter' }[key] || key.toUpperCase();
    if (isMac) {
      const sym = { ctrl: '\u2303', alt: '\u2325', shift: '\u21E7', cmd: '\u2318' };
      return ['ctrl', 'alt', 'shift', 'cmd'].filter((m) => parts.includes(m)).map((m) => sym[m]).join('') + keyLabel;
    }
    const name = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', cmd: 'Ctrl' };
    const mods = [...new Set(['ctrl', 'cmd', 'alt', 'shift'].filter((m) => parts.includes(m)).map((m) => name[m]))];
    return mods.concat(keyLabel).join('+');
  }

  function applyAccent(hex) {
    if (!hex || !/^#?[0-9a-f]{6}/i.test(hex)) return;
    document.documentElement.style.setProperty('--accent', '#' + hex.replace('#', '').slice(0, 6));
  }

  if (desktop) {
    applyAccent(desktop.accentColor);
    desktop.onSystem((info) => {
      if ('accentColor' in info) applyAccent(info.accentColor);
      if ('fullscreen' in info) document.body.classList.toggle('fullscreen', info.fullscreen);
    });
  }

  // Lists and buttons dim when the window is in the background, as on macOS.
  window.addEventListener('blur', () => document.body.classList.add('inactive'));
  window.addEventListener('focus', () => document.body.classList.remove('inactive'));
  if (!document.hasFocus()) document.body.classList.add('inactive');

  function announce(text) {
    el.liveRegion.textContent = '';
    setTimeout(() => { el.liveRegion.textContent = text; }, 30);
  }

  const KEYS_DEFAULT = { find: 'cmd+f', todo: 'cmd+1' };

  // ---------- State ----------

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const now = () => new Date().toISOString();

  function newPage(title = '') {
    const t = now();
    return { id: uid(), title, level: 0, created: t, updated: t, notes: [] };
  }

  function newSection(name, color) {
    return { id: uid(), name, color: color || SECTION_COLORS[0], pages: [newPage()], lastPageId: null };
  }

  function newNotebook(name) {
    return { id: uid(), name, sections: [newSection('New Section')], lastSectionId: null };
  }

  function defaultState() {
    const welcome = newPage('Welcome');
    welcome.notes.push({
      id: uid(), x: 40, y: 20, w: 520,
      html:
        '<h2>Welcome to your notebook</h2>' +
        '<p>Notes are organized as <b>Notebooks &gt; Sections &gt; Pages</b>, just like OneNote.</p>' +
        '<ul>' +
        '<li>Click anywhere on the page to start a new note container.</li>' +
        '<li>Drag a note by its top bar to move it; drag its right edge to resize.</li>' +
        '<li>Drag sections and pages to reorder them. Drop a page on a section to move it there.</li>' +
        '<li>Right-click a section or page for more options (rename, colour, subpage, delete).</li>' +
        `<li>Use ${formatKeys(KEYS_DEFAULT.find)} to search everything, and ${formatKeys(KEYS_DEFAULT.todo)} for a to-do checkbox.</li>` +
        '</ul>' +
        '<p><span class="todo" contenteditable="false" data-checked="true"></span>Open the app</p>' +
        '<p><span class="todo" contenteditable="false" data-checked="false"></span>Write your first note</p>',
    });
    const quick = { id: uid(), name: 'Quick Notes', color: SECTION_COLORS[0], pages: [welcome], lastPageId: welcome.id };
    const nb = { id: uid(), name: 'My Notebook', sections: [quick], lastSectionId: quick.id };
    return { notebooks: [nb], activeNotebookId: nb.id, prefs: defaultPrefs() };
  }

  function defaultPrefs() {
    return { sidebarHidden: false, sidebarWidth: 220, pagesWidth: 280, textScale: 1 };
  }


  function loadState() {
    try {
      const raw = desktop ? desktop.load() : localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (isValidState(data)) return normalizeState(data);
      }
    } catch (e) { /* fall through to default */ }
    return defaultState();
  }

  // Page levels must form a valid tree: first page is top level, each page at most one level below the one above.
  function normalizeLevels(s) {
    let prev = -1;
    for (const p of s.pages) {
      p.level = Math.max(0, Math.min(Number.isInteger(p.level) ? p.level : 0, prev + 1));
      prev = p.level;
    }
  }

  // Fills in optional fields so hand-written import files only need ids and the nesting arrays.
  function normalizeState(data) {
    const t = now();
    const num = (v, d) => (Number.isFinite(v) ? v : d);
    data.notebooks.forEach((nb) => {
      nb.name = typeof nb.name === 'string' && nb.name.trim() ? nb.name : 'Untitled Notebook';
      nb.sections.forEach((s, si) => {
        s.name = typeof s.name === 'string' && s.name.trim() ? s.name : 'Untitled Section';
        s.color = typeof s.color === 'string' ? s.color : SECTION_COLORS[si % SECTION_COLORS.length];
        s.pages.forEach((p) => {
          p.title = typeof p.title === 'string' ? p.title : '';
          p.created = isNaN(Date.parse(p.created)) ? t : p.created;
          p.updated = isNaN(Date.parse(p.updated)) ? p.created : p.updated;
          p.notes.forEach((n, ni) => {
            n.id = typeof n.id === 'string' ? n.id : uid();
            n.x = num(n.x, 40);
            n.y = num(n.y, 20 + ni * 200);
            n.w = num(n.w, 500);
            n.html = typeof n.html === 'string' ? n.html : '';
          });
        });
        normalizeLevels(s);
      });
    });
    if (!data.notebooks.some((n) => n.id === data.activeNotebookId)) data.activeNotebookId = data.notebooks[0].id;
    data.prefs = Object.assign(defaultPrefs(), state && state.prefs, data.prefs);
    return data;
  }

  function isValidState(data) {
    return data && Array.isArray(data.notebooks) && data.notebooks.every((nb) =>
      nb && typeof nb.id === 'string' && Array.isArray(nb.sections) && nb.sections.every((s) =>
        s && typeof s.id === 'string' && Array.isArray(s.pages) && s.pages.every((p) =>
          p && typeof p.id === 'string' && Array.isArray(p.notes))));
  }

  let state = null;
  state = loadState();
  let saveTimer = null;
  let saveWarned = false;

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      const json = JSON.stringify(state);
      if (desktop) {
        const res = desktop.save(json);
        if (!res || !res.ok) throw new Error(res && res.error);
      } else {
        localStorage.setItem(STORAGE_KEY, json);
      }
      saveWarned = false;
    } catch (e) {
      if (!saveWarned) {
        saveWarned = true;
        showAlert('Your notes couldn\u2019t be saved.', (e && e.message ? e.message + '\n\n' : '') + 'Export your data to keep a copy.');
      }
    }
  }

  window.addEventListener('beforeunload', saveNow);

  // ---------- Accessors ----------

  const notebook = () => state.notebooks.find((n) => n.id === state.activeNotebookId) || state.notebooks[0];

  function section() {
    const nb = notebook();
    if (!nb) return null;
    return nb.sections.find((s) => s.id === nb.lastSectionId) || nb.sections[0] || null;
  }

  function page() {
    const s = section();
    if (!s) return null;
    return s.pages.find((p) => p.id === s.lastPageId) || s.pages[0] || null;
  }

  function findPage(pageId) {
    for (const nb of state.notebooks) {
      for (const s of nb.sections) {
        const p = s.pages.find((x) => x.id === pageId);
        if (p) return { nb, s, p };
      }
    }
    return null;
  }

  function navigateTo(nbId, sectionId, pageId) {
    state.activeNotebookId = nbId;
    const nb = notebook();
    if (sectionId) nb.lastSectionId = sectionId;
    const s = section();
    if (pageId && s) s.lastPageId = pageId;
    save();
    render();
  }

  // ---------- Sanitizing ----------

  const BLOCKED_TAGS = 'script,style,iframe,object,embed,link,meta,base,form,input,button,textarea,select';

  function sanitize(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html || '';
    tpl.content.querySelectorAll(BLOCKED_TAGS).forEach((n) => n.remove());
    tpl.content.querySelectorAll('*').forEach((n) => {
      for (const attr of [...n.attributes]) {
        const name = attr.name.toLowerCase();
        const val = attr.value.trim().toLowerCase();
        if (name.startsWith('on')) n.removeAttribute(attr.name);
        else if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
                 (val.startsWith('javascript:') || (val.startsWith('data:') && !val.startsWith('data:image/')))) {
          n.removeAttribute(attr.name);
        }
      }
    });
    return tpl.innerHTML;
  }

  function htmlToText(html) {
    const tpl = document.createElement('template');
    // Pad block boundaries so adjacent paragraphs don't run together.
    tpl.innerHTML = (html || '').replace(/<\/(p|div|h\d|li|td)>|<br\s*\/?>/gi, ' $&');
    return (tpl.content.textContent || '').replace(/\s+/g, ' ').trim();
  }

  const pageText = (p) => p.notes.map((n) => htmlToText(n.html)).join(' ');

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Rendering ----------

  function render() {
    applyPrefs();
    renderNotebooks();
    renderSections();
    renderPages();
    renderPage();
    if (el.searchInput.value.trim()) renderSearch();
  }

  function renderNotebooks() {
    el.notebookName.textContent = notebook().name;
    el.notebookBtn.setAttribute('aria-label', `Notebook: ${notebook().name}`);
  }

  function svgIcon(name) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  // Lists use a roving tabindex: only the selected row is tabbable, arrows move between rows.
  function focusSelected(list) {
    const li = list.querySelector('li[aria-selected="true"]') || list.querySelector('li[tabindex]');
    if (li) li.focus();
  }

  function renderSections() {
    const nb = notebook();
    const active = section();
    const hadFocus = el.sectionList.contains(document.activeElement);
    el.sectionList.innerHTML = '';
    for (const s of nb.sections) {
      const li = document.createElement('li');
      li.dataset.id = s.id;
      li.draggable = true;
      li.setAttribute('role', 'option');
      const selected = !!active && s.id === active.id;
      li.setAttribute('aria-selected', String(selected));
      li.tabIndex = selected ? 0 : -1;
      li.setAttribute('aria-label', `${s.name}, ${s.pages.length} page${s.pages.length === 1 ? '' : 's'}`);
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = s.color;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = s.name;
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = s.pages.length;
      li.append(dot, name, count);
      el.sectionList.appendChild(li);
    }
    if (!active && el.sectionList.firstChild) el.sectionList.firstChild.tabIndex = 0;
    if (hadFocus) focusSelected(el.sectionList);
  }

  function shortDate(iso) {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric', year: '2-digit' });
  }

  function renderPages() {
    const s = section();
    const active = page();
    const hadFocus = el.pageList.contains(document.activeElement);
    el.pageList.innerHTML = '';
    el.pagesHeader.textContent = s ? s.name : 'Pages';
    el.pagesCount.textContent = s ? `${s.pages.length} page${s.pages.length === 1 ? '' : 's'}` : '';
    el.addPageBtn.disabled = !s;
    if (!s) return;
    let hideDeeperThan = Infinity; // set while inside a collapsed page's subtree
    s.pages.forEach((p, i) => {
      if (p.level > hideDeeperThan) return;
      hideDeeperThan = p.collapsed ? p.level : Infinity;
      const li = document.createElement('li');
      li.dataset.id = p.id;
      li.draggable = true;
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-level', String(p.level + 1));
      const selected = !!active && p.id === active.id;
      li.setAttribute('aria-selected', String(selected));
      li.tabIndex = selected ? 0 : -1;
      li.style.paddingLeft = (4 + Math.min(p.level, 8) * 16) + 'px';
      const twisty = document.createElement('span');
      twisty.className = 'disclosure';
      twisty.setAttribute('aria-hidden', 'true');
      if (hasChildren(s.pages, i)) {
        twisty.classList.add('has-children');
        twisty.classList.toggle('open', !p.collapsed);
        twisty.appendChild(svgIcon('chevron-right'));
        li.setAttribute('aria-expanded', String(!p.collapsed));
      }
      const label = document.createElement('span');
      label.className = 'label';
      const title = document.createElement('span');
      title.className = 'title';
      title.textContent = p.title || 'Untitled Page';
      const sub = document.createElement('span');
      sub.className = 'sub';
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = shortDate(p.updated || p.created);
      const preview = document.createElement('span');
      preview.className = 'preview';
      preview.textContent = pageText(p).slice(0, 80) || 'No additional text';
      sub.append(date, preview);
      label.append(title, sub);
      li.append(twisty, label);
      el.pageList.appendChild(li);
    });
    if (!el.pageList.querySelector('li[tabindex="0"]') && el.pageList.firstChild) el.pageList.firstChild.tabIndex = 0;
    if (hadFocus) focusSelected(el.pageList);
  }

  function updateActivePageListItem() {
    const p = page();
    const li = p && el.pageList.querySelector(`li[data-id="${p.id}"]`);
    if (!li) return;
    li.querySelector('.title').textContent = p.title || 'Untitled Page';
    li.querySelector('.date').textContent = shortDate(p.updated || p.created);
    li.querySelector('.preview').textContent = pageText(p).slice(0, 80) || 'No additional text';
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
      '  ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  let renderedPageId = null;
  let zCounter = 1;

  function renderPage() {
    const p = page();
    el.emptyState.classList.toggle('hidden', !!p);
    if (!p) {
      el.canvas.innerHTML = '';
      el.pageTitle.value = '';
      el.pageMeta.textContent = '';
      renderedPageId = null;
      return;
    }
    if (document.activeElement !== el.pageTitle || renderedPageId !== p.id) el.pageTitle.value = p.title;
    renderPageMeta(p);
    if (renderedPageId === p.id) return; // keep DOM (and caret) intact while editing
    renderedPageId = p.id;
    el.canvas.innerHTML = '';
    for (const n of p.notes) el.canvas.appendChild(buildNote(n));
  }

  function renderPageMeta(p) {
    const s = section();
    const crumbs = [s.name];
    const chain = [];
    for (let i = parentIndex(s.pages, s.pages.indexOf(p)); i >= 0; i = parentIndex(s.pages, i)) {
      chain.unshift(s.pages[i].title || 'Untitled Page');
    }
    el.pageMeta.innerHTML = '';
    const c = document.createElement('span');
    c.className = 'crumbs';
    c.textContent = crumbs.concat(chain).join('  \u203A  ');
    el.pageMeta.append(c, formatDate(p.created));
  }

  function buildNote(n) {
    const wrap = document.createElement('div');
    wrap.className = 'note';
    wrap.dataset.id = n.id;
    wrap.style.left = n.x + 'px';
    wrap.style.top = n.y + 'px';
    wrap.style.width = n.w + 'px';

    const handle = document.createElement('div');
    handle.className = 'handle';
    handle.setAttribute('aria-hidden', 'true');

    const body = document.createElement('div');
    body.className = 'body';
    body.contentEditable = 'true';
    body.setAttribute('role', 'textbox');
    body.setAttribute('aria-multiline', 'true');
    body.setAttribute('aria-label', 'Note');
    body.spellcheck = true;
    body.innerHTML = sanitize(n.html);

    const resize = document.createElement('div');
    resize.className = 'resize';
    resize.setAttribute('aria-hidden', 'true');

    wrap.append(handle, body, resize);
    return wrap;
  }

  // ---------- Notebook actions ----------

  async function newNotebookDialog() {
    const name = await askText('New Notebook', 'New Notebook');
    if (!name || !name.trim()) return;
    const nb = newNotebook(name.trim());
    state.notebooks.push(nb);
    navigateTo(nb.id);
    announce(`Notebook ${nb.name} created`);
  }

  function notebookMenuItems() {
    const nb = notebook();
    return [
      ...state.notebooks.map((n) => ({ label: n.name, checked: n === nb, action: () => navigateTo(n.id) })),
      { separator: true },
      { label: 'New Notebook…', action: newNotebookDialog },
      { label: `Rename “${nb.name}”…`, action: async () => {
        const name = await askText('Rename Notebook', nb.name);
        if (name && name.trim()) { nb.name = name.trim(); save(); render(); }
      } },
      { label: `Delete “${nb.name}”…`, danger: true, disabled: state.notebooks.length === 1, action: async () => {
        const ok = await askConfirm({
          message: `Delete the notebook “${nb.name}”?`,
          detail: 'All of its sections and pages will be deleted. This can’t be undone.',
          okLabel: 'Delete', destructive: true,
        });
        if (!ok) return;
        state.notebooks = state.notebooks.filter((n) => n !== nb);
        navigateTo(state.notebooks[0].id);
        announce('Notebook deleted');
      } },
      { separator: true },
      { label: 'Import…', keys: 'cmd+o', action: importData },
      { label: 'Export…', keys: 'shift+cmd+e', action: exportData },
    ];
  }

  el.notebookBtn.addEventListener('click', () => showMenuBelow(el.notebookBtn, notebookMenuItems()));

  // ---------- Section actions ----------

  el.addSectionBtn.addEventListener('click', () => newSection_());

  function newSection_() {
    const nb = notebook();
    const s = newSection('New Section', SECTION_COLORS[nb.sections.length % SECTION_COLORS.length]);
    nb.sections.push(s);
    navigateTo(nb.id, s.id);
    if (document.body.classList.contains('sidebar-hidden')) toggleSidebar();
    startRename(el.sectionList.querySelector(`li[data-id="${s.id}"]`), s, 'name');
  }

  el.sectionList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li && !li.querySelector('input')) navigateTo(notebook().id, li.dataset.id);
  });

  el.sectionList.addEventListener('dblclick', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const s = notebook().sections.find((x) => x.id === li.dataset.id);
    startRename(li, s, 'name');
  });

  function sectionMenuItems(li) {
    const nb = notebook();
    const s = nb.sections.find((x) => x.id === li.dataset.id);
    const items = [
      { label: 'New Page in Section…', action: () => newPageDialog(null, s.id) },
      { label: 'Rename', keys: 'enter', action: () => startRename(li, s, 'name') },
      { label: 'Colour', submenu: SECTION_COLORS.map((c, i) => ({
        label: COLOR_NAMES[i], color: c, checked: s.color === c,
        action: () => { s.color = c; save(); renderSections(); },
      })) },
    ];
    const others = state.notebooks.filter((n) => n !== nb);
    if (others.length) {
      items.push({ label: 'Move to Notebook', submenu: others.map((other) => ({
        label: other.name,
        action: () => {
          nb.sections = nb.sections.filter((x) => x !== s);
          other.sections.push(s);
          save(); render();
          announce(`Moved to ${other.name}`);
        },
      })) });
    }
    items.push({ separator: true });
    items.push({ label: 'Delete Section…', keys: 'cmd+backspace', danger: true, action: () => deleteSection(s) });
    return items;
  }

  async function deleteSection(s) {
    const nb = notebook();
    const ok = await askConfirm({
      message: `Delete the section “${s.name}”?`,
      detail: `Its ${s.pages.length} page${s.pages.length === 1 ? '' : 's'} will be deleted. This can’t be undone.`,
      okLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    nb.sections = nb.sections.filter((x) => x !== s);
    if (nb.lastSectionId === s.id) nb.lastSectionId = nb.sections[0] ? nb.sections[0].id : null;
    renderedPageId = null;
    save(); render();
    announce('Section deleted');
  }

  el.sectionList.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, sectionMenuItems(li));
  });

  // ---------- Page tree ----------
  // Pages are a flat ordered list per section; `level` is the nesting depth.
  // A page's subtree is the page itself plus the pages right after it with a deeper level.

  function subtreeSize(pages, idx) {
    let n = 1;
    while (pages[idx + n] && pages[idx + n].level > pages[idx].level) n++;
    return n;
  }

  const hasChildren = (pages, idx) => !!pages[idx + 1] && pages[idx + 1].level > pages[idx].level;

  function parentIndex(pages, idx) {
    for (let i = idx - 1; i >= 0; i--) if (pages[i].level < pages[idx].level) return i;
    return -1;
  }

  function findSection(sectionId) {
    for (const nb of state.notebooks) {
      const s = nb.sections.find((x) => x.id === sectionId);
      if (s) return { nb, s };
    }
    return null;
  }

  function insertSubtree(group, s, at, level) {
    const delta = level - group[0].level;
    group.forEach((p) => { p.level += delta; });
    s.pages.splice(at, 0, ...group);
    normalizeLevels(s);
  }

  // Puts a subtree as the last child of `parent`, or at the end of the section when parent is null.
  function placeSubtree(group, s, parent) {
    if (!parent) return insertSubtree(group, s, s.pages.length, 0);
    const pi = s.pages.indexOf(parent);
    parent.collapsed = false;
    insertSubtree(group, s, pi + subtreeSize(s.pages, pi), parent.level + 1);
  }

  function takeSubtree(s, idx) {
    const group = s.pages.splice(idx, subtreeSize(s.pages, idx));
    if (group.some((p) => p.id === s.lastPageId)) {
      const next = s.pages[idx] || s.pages[idx - 1];
      s.lastPageId = next ? next.id : null;
    }
    return group;
  }

  function movePage(from, pageId, toSectionId, parentId) {
    const target = findSection(toSectionId);
    if (!target) return;
    const idx = from.pages.findIndex((p) => p.id === pageId);
    if (idx < 0) return;
    const ids = from.pages.slice(idx, idx + subtreeSize(from.pages, idx)).map((p) => p.id);
    if (parentId && ids.includes(parentId)) return; // can't move a page under itself
    const group = takeSubtree(from, idx);
    placeSubtree(group, target.s, parentId ? target.s.pages.find((p) => p.id === parentId) : null);
    navigateTo(target.nb.id, target.s.id, pageId);
  }

  // ---------- Page actions ----------

  async function newPageDialog(parentId = null, sectionId = section() && section().id) {
    const choice = await choosePlacement({
      heading: 'New Page', okLabel: 'Create', askTitle: true,
      sectionId, parentId,
    });
    if (!choice) return;
    const target = findSection(choice.sectionId);
    if (!target) return;
    const p = newPage(choice.title);
    placeSubtree([p], target.s, choice.parentId ? target.s.pages.find((x) => x.id === choice.parentId) : null);
    navigateTo(target.nb.id, target.s.id, p.id);
    if (p.title) createNote(40, 20);
    else el.pageTitle.focus();
  }


  el.pageList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li || li.querySelector('input')) return;
    const s = section();
    if (e.target.closest('.disclosure.has-children')) {
      const p = s.pages.find((x) => x.id === li.dataset.id);
      p.collapsed = !p.collapsed;
      save(); renderPages();
      return;
    }
    navigateTo(notebook().id, s.id, li.dataset.id);
  });

  el.pageList.addEventListener('dblclick', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li || e.target.closest('.disclosure')) return;
    el.pageTitle.focus();
    el.pageTitle.select();
  });

  el.pageList.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    e.preventDefault();
    showMenu(e.clientX, e.clientY, pageMenuItems(li.dataset.id));
  });

  function pageMenuItems(pageId) {
    const nb = notebook();
    const s = section();
    const idx = s.pages.findIndex((x) => x.id === pageId);
    const p = s.pages[idx];
    const size = subtreeSize(s.pages, idx);
    const pi = parentIndex(s.pages, idx);
    const items = [
      { label: 'New Subpage…', keys: KEYS.newSubpage, action: () => newPageDialog(p.id) },
      { label: 'Rename', keys: 'enter', action: () => { navigateTo(nb.id, s.id, p.id); el.pageTitle.focus(); el.pageTitle.select(); } },
      { separator: true },
      { label: 'Move Under…', action: async () => {
        const choice = await choosePlacement({
          heading: `Move "${p.title || 'Untitled Page'}"`, okLabel: 'Move', askTitle: false,
          sectionId: s.id, parentId: pi >= 0 ? s.pages[pi].id : null,
          exclude: new Set(s.pages.slice(idx, idx + size).map((x) => x.id)),
        });
        if (choice) movePage(s, p.id, choice.sectionId, choice.parentId);
      } },
    ];
    if (idx > 0 && s.pages[idx - 1].level >= p.level) {
      items.push({ label: 'Make Subpage of Page Above', keys: 'cmd+]', action: () => {
        s.pages.slice(idx, idx + size).forEach((x) => { x.level++; });
        let above = idx - 1;
        while (s.pages[above].level > p.level - 1) above--;
        s.pages[above].collapsed = false;
        save(); render();
      } });
    }
    if (p.level > 0) {
      items.push({ label: 'Move Out One Level', keys: 'cmd+[', action: () => {
        // Becomes the next sibling of its current parent.
        const group = s.pages.splice(idx, size);
        insertSubtree(group, s, pi + subtreeSize(s.pages, pi), p.level - 1);
        save(); render();
      } });
    }
    if (size > 1) {
      items.push({ label: p.collapsed ? 'Expand Subpages' : 'Collapse Subpages', action: () => {
        p.collapsed = !p.collapsed; save(); renderPages();
      } });
    }
    items.push({ separator: true });
    items.push({ label: 'Duplicate', action: () => {
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = uid();
      copy.title = (p.title || 'Untitled Page') + ' (copy)';
      copy.created = copy.updated = now();
      copy.collapsed = false;
      copy.notes.forEach((n) => { n.id = uid(); });
      s.pages.splice(idx + size, 0, copy);
      navigateTo(nb.id, s.id, copy.id);
    } });
    items.push({ separator: true });
    items.push({ label: 'Delete Page…', keys: 'cmd+backspace', danger: true, action: () => deletePage(p.id) });
    return items;
  }

  async function deletePage(pageId) {
    const s = section();
    const idx = s.pages.findIndex((x) => x.id === pageId);
    if (idx < 0) return;
    const p = s.pages[idx];
    const size = subtreeSize(s.pages, idx);
    const extra = size > 1 ? ` Its ${size - 1} subpage${size > 2 ? 's' : ''} will also be deleted.` : '';
    const ok = await askConfirm({
      message: `Delete “${p.title || 'Untitled Page'}”?`,
      detail: `This can’t be undone.${extra}`,
      okLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    const listHadFocus = el.pageList.contains(document.activeElement);
    takeSubtree(s, s.pages.indexOf(p));
    if (renderedPageId === p.id) renderedPageId = null;
    save(); render();
    if (listHadFocus) focusSelected(el.pageList);
    announce('Page deleted');
  }

  // Indent (make subpage of the page above) or outdent the selected page from the keyboard.
  function indentPage(dir) {
    const p = page();
    if (!p) return;
    const item = pageMenuItems(p.id).find((i) => i.keys === (dir > 0 ? 'cmd+]' : 'cmd+['));
    if (item) item.action();
  }

  // ---------- Placement picker ----------

  // Shows every section and page; resolves to { title, sectionId, parentId } (parentId null = top level) or null.
  function choosePlacement({ heading, okLabel, askTitle, sectionId, parentId = null, exclude = new Set() }) {
    const d = el.placeDialog;
    el.placeHeading.textContent = heading;
    el.placeOk.textContent = okLabel;
    el.placeNameRow.classList.toggle('hidden', !askTitle);
    el.placeName.value = '';
    el.placeFilter.value = '';
    let selected = { sectionId: sectionId || (state.notebooks[0].sections[0] || {}).id, parentId };

    function option(text, value, indent, extraClass) {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.dataset.section = value.sectionId;
      li.dataset.parent = value.parentId || '';
      li.style.paddingLeft = (10 + indent * 16) + 'px';
      li.textContent = text;
      if (extraClass) li.classList.add(extraClass);
      const isSel = value.sectionId === selected.sectionId && (value.parentId || null) === (selected.parentId || null);
      li.setAttribute('aria-selected', String(isSel));
      if (isSel) li.id = 'placeSelected';
      return li;
    }

    function build() {
      const q = el.placeFilter.value.trim().toLowerCase();
      el.placeList.innerHTML = '';
      for (const nb of state.notebooks) {
        const rows = [];
        for (const s of nb.sections) {
          const sectionRow = option(`${s.name}  (top level, no parent)`, { sectionId: s.id, parentId: null }, 0, 'none');
          const dot = document.createElement('span');
          dot.className = 'swatch-dot';
          dot.style.background = s.color;
          sectionRow.prepend(dot);
          const pageRows = s.pages
            .filter((p) => !exclude.has(p.id))
            .filter((p) => !q || (p.title || 'Untitled Page').toLowerCase().includes(q))
            .map((p) => option(p.title || 'Untitled Page', { sectionId: s.id, parentId: p.id }, 1 + (q ? 0 : p.level)));
          if (q && !pageRows.length && !s.name.toLowerCase().includes(q)) continue;
          rows.push(sectionRow, ...pageRows);
        }
        if (!rows.length) continue;
        const group = document.createElement('li');
        group.className = 'group';
        group.textContent = nb.name;
        el.placeList.append(group, ...rows);
      }
      const sel = el.placeList.querySelector('[aria-selected="true"]');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
      el.placeFilter.setAttribute('aria-activedescendant', sel ? sel.id : '');
    }

    return new Promise((resolve) => {
      const select = (li) => {
        selected = { sectionId: li.dataset.section, parentId: li.dataset.parent || null };
        el.placeList.querySelectorAll('[aria-selected]').forEach((x) => { x.setAttribute('aria-selected', 'false'); x.removeAttribute('id'); });
        li.setAttribute('aria-selected', 'true');
        li.id = 'placeSelected';
        el.placeFilter.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest' });
      };
      const pick = (e) => {
        const li = e.target.closest('li[data-section]');
        if (!li) return;
        select(li);
        if (e.type === 'dblclick') d.close('ok');
      };
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); d.close('ok'); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          // Arrows move through the parent list while typing in either field.
          e.preventDefault();
          const rows = [...el.placeList.querySelectorAll('li[data-section]')];
          const i = rows.findIndex((r) => r.getAttribute('aria-selected') === 'true');
          const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
          if (next) select(next);
        }
      };
      const onClose = () => {
        el.placeList.removeEventListener('click', pick);
        el.placeList.removeEventListener('dblclick', pick);
        el.placeFilter.removeEventListener('input', build);
        d.removeEventListener('keydown', onKey);
        resolve(d.returnValue === 'ok' && selected.sectionId
          ? { title: el.placeName.value.trim(), sectionId: selected.sectionId, parentId: selected.parentId }
          : null);
      };
      el.placeList.addEventListener('click', pick);
      el.placeList.addEventListener('dblclick', pick);
      el.placeFilter.addEventListener('input', build);
      d.addEventListener('keydown', onKey);
      d.addEventListener('close', onClose, { once: true });
      d.returnValue = '';
      build();
      d.showModal();
      (askTitle ? el.placeName : el.placeFilter).focus();
    });
  }

  // Replacement for window.prompt(), which desktop (Electron) builds don't support.
  function askText(heading, value = '') {
    const d = el.textDialog;
    el.textHeading.textContent = heading;
    el.textValue.value = value;
    return new Promise((resolve) => {
      const onKey = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); d.close('ok'); }
      };
      d.addEventListener('keydown', onKey);
      d.addEventListener('close', () => {
        d.removeEventListener('keydown', onKey);
        resolve(d.returnValue === 'ok' ? el.textValue.value : null);
      }, { once: true });
      d.returnValue = '';
      d.showModal();
      el.textValue.focus();
      el.textValue.select();
    });
  }

  el.pageTitle.addEventListener('input', () => {
    const p = page();
    if (!p) return;
    p.title = el.pageTitle.value;
    p.updated = now();
    save();
    updateActivePageListItem();
  });

  el.pageTitle.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const body = el.canvas.querySelector('.note .body');
      if (body) body.focus();
      else createNote(40, 20);
    }
  });

  // ---------- Inline rename ----------

  function startRename(li, obj, key) {
    if (!li || !obj) return;
    const input = document.createElement('input');
    input.className = 'rename-input';
    input.setAttribute('aria-label', 'Name');
    input.value = obj[key];
    li.textContent = '';
    li.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      if (commit && input.value.trim()) obj[key] = input.value.trim();
      save(); render();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
  }

  // ---------- Notes on canvas ----------

  function noteData(wrap) {
    const p = page();
    return p && wrap ? p.notes.find((n) => n.id === wrap.dataset.id) : null;
  }

  function createNote(x, y) {
    const p = page();
    if (!p) return;
    const n = { id: uid(), x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), w: 400, html: EMPTY_NOTE_HTML };
    p.notes.push(n);
    const wrap = buildNote(n);
    el.canvas.appendChild(wrap);
    const body = wrap.querySelector('.body');
    body.focus();
    placeCaretAtEnd(body);
    save();
  }

  function placeCaretAtEnd(node) {
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function noteIsEmpty(body) {
    return !body.textContent.trim() && !body.querySelector('img,table,.todo');
  }

  el.canvas.addEventListener('mousedown', (e) => {
    if (e.target !== el.canvas || e.button !== 0) return;
    e.preventDefault();
    createNote(e.offsetX, e.offsetY);
  });

  el.canvas.addEventListener('input', (e) => {
    const body = e.target.closest('.body');
    if (!body) return;
    commitNote(body);
  });

  function commitNote(body) {
    const n = noteData(body.parentElement);
    if (!n) return;
    n.html = body.innerHTML;
    page().updated = now();
    save();
    updateActivePageListItem();
  }

  el.canvas.addEventListener('focusin', (e) => {
    const wrap = e.target.closest('.note');
    if (wrap) wrap.style.zIndex = ++zCounter;
  });

  el.canvas.addEventListener('focusout', (e) => {
    const body = e.target.closest && e.target.closest('.body');
    if (!body) return;
    // Defer so toolbar inputs and dialogs (image, link) can still insert into a fresh note.
    setTimeout(() => {
      if (!body.isConnected || !noteIsEmpty(body) || document.activeElement === body || !document.hasFocus()) return;
      if (el.toolbar.contains(document.activeElement)) return;
      const wrap = body.parentElement;
      const p = page();
      if (p) p.notes = p.notes.filter((n) => n.id !== wrap.dataset.id);
      wrap.remove();
      save();
    }, 0);
  });

  el.canvas.addEventListener('click', (e) => {
    const todo = e.target.closest('.todo');
    if (todo) {
      todo.dataset.checked = todo.dataset.checked === 'true' ? 'false' : 'true';
      commitNote(todo.closest('.body'));
      return;
    }
    const link = e.target.closest('.body a[href]');
    if (link && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener');
    }
  });

  // Move and resize note containers.
  el.canvas.addEventListener('pointerdown', (e) => {
    const isHandle = e.target.classList.contains('handle');
    const isResize = e.target.classList.contains('resize');
    if (!isHandle && !isResize) return;
    e.preventDefault();
    const wrap = e.target.parentElement;
    const n = noteData(wrap);
    if (!n) return;
    wrap.style.zIndex = ++zCounter;
    const startX = e.clientX, startY = e.clientY;
    const orig = { x: n.x, y: n.y, w: n.w };
    e.target.setPointerCapture(e.pointerId);

    const move = (ev) => {
      const dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (isHandle) {
        n.x = Math.max(0, orig.x + dx);
        n.y = Math.max(0, orig.y + dy);
        wrap.style.left = n.x + 'px';
        wrap.style.top = n.y + 'px';
      } else {
        n.w = Math.max(120, orig.w + dx);
        wrap.style.width = n.w + 'px';
      }
    };
    const up = () => {
      e.target.removeEventListener('pointermove', move);
      e.target.removeEventListener('pointerup', up);
      save();
    };
    e.target.addEventListener('pointermove', move);
    e.target.addEventListener('pointerup', up);
  });

  // ---------- Formatting ----------

  let savedRange = null;

  document.addEventListener('selectionchange', () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const node = sel.anchorNode;
    const host = node && (node.nodeType === 1 ? node : node.parentElement);
    if (host && host.closest('.note .body')) savedRange = sel.getRangeAt(0).cloneRange();
  });

  // Toolbar buttons reflect the formatting at the caret, like a native text toolbar.
  const STATE_COMMANDS = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikeThrough',
    bullets: 'insertUnorderedList', numbers: 'insertOrderedList' };

  function updateToolbarState() {
    const inNote = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.note .body'));
    for (const [cmd, native] of Object.entries(STATE_COMMANDS)) {
      const b = el.toolbar.querySelector(`[data-command="${cmd}"]`);
      let on = false;
      try { on = inNote && document.queryCommandState(native); } catch (e) { /* unsupported */ }
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  document.addEventListener('selectionchange', updateToolbarState);
  document.addEventListener('focusout', () => setTimeout(updateToolbarState, 0));

  function restoreSelection() {
    if (!savedRange) return null;
    const c = savedRange.startContainer;
    const host = c.nodeType === 1 ? c : c.parentElement;
    const body = host && host.closest('.body');
    if (!body || !body.isConnected) return null;
    body.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    return body;
  }

  function activeBody() {
    const a = document.activeElement;
    return a && a.classList && a.classList.contains('body') ? a : restoreSelection();
  }

  function exec(cmd, value = null) {
    const body = activeBody();
    if (!body) return;
    document.execCommand('styleWithCSS', false, cmd === 'hiliteColor' || cmd === 'foreColor');
    document.execCommand(cmd, false, value);
    commitNote(body);
  }

  // The note being edited, or a new note below the existing ones.
  function ensureBody(x, y) {
    const existing = activeBody();
    if (existing) return existing;
    if (!page()) return null;
    if (x === undefined) {
      const bottom = Math.max(0, ...[...el.canvas.querySelectorAll('.note')].map((n) => n.offsetTop + n.offsetHeight));
      x = 40; y = bottom + 20;
    }
    createNote(x, y);
    const body = el.canvas.lastElementChild.querySelector('.body');
    body.innerHTML = '';
    body.focus();
    return body;
  }

  function insertHtml(html) {
    const body = ensureBody();
    if (!body) { showAlert('Create a page first.'); return; }
    document.execCommand('insertHTML', false, html);
    commitNote(body);
  }

  function toggleTodo() {
    const body = activeBody();
    if (!body) return;
    const sel = window.getSelection();
    let node = sel.anchorNode;
    if (node && node.nodeType !== 1) node = node.parentElement;
    let block = node && node.closest('p,li,h1,h2,div:not(.body)');
    if (!block || !body.contains(block)) {
      document.execCommand('formatBlock', false, 'P');
      node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
      block = node && node.closest('p');
      if (!block || !body.contains(block)) return;
    }
    const first = block.firstElementChild;
    if (first && first.classList.contains('todo') && block.firstChild === first) {
      first.remove();
    } else {
      const box = document.createElement('span');
      box.className = 'todo';
      box.contentEditable = 'false';
      box.dataset.checked = 'false';
      block.insertBefore(box, block.firstChild);
    }
    commitNote(body);
  }

  function insertLink() {
    const range = savedRange;
    askText('Add Link', 'https://').then((url) => {
      if (!url || /^\s*javascript:/i.test(url)) return;
      savedRange = range;
      restoreSelection();
      if (window.getSelection().isCollapsed) insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
      else exec('createLink', url);
    });
  }

  function insertTable() {
    const range = savedRange;
    askText('Table Size (rows × columns)', '3x3').then((spec) => {
      const m = spec && spec.match(/^\s*(\d+)\s*[x*,×]\s*(\d+)\s*$/i);
      if (!m) return;
      const rows = Math.min(+m[1], 50), cols = Math.min(+m[2], 20);
      const row = '<tr>' + '<td><br></td>'.repeat(cols) + '</tr>';
      savedRange = range;
      insertHtml('<table><tbody>' + row.repeat(rows) + '</tbody></table><p><br></p>');
    });
  }

  const TEXT_COLORS = [['Red', '#ff3b30'], ['Orange', '#ff9500'], ['Yellow', '#d4a000'], ['Green', '#28a745'],
    ['Blue', '#007aff'], ['Purple', '#af52de'], ['Pink', '#ff2d55'], ['Grey', '#8e8e93']];

  function setTextColor(c) {
    el.colorBar.style.background = c;
    exec('foreColor', c);
  }

  function textColorItems() {
    return [
      ...TEXT_COLORS.map(([name, c]) => ({ label: name, color: c, action: () => setTextColor(c) })),
      { separator: true },
      { label: 'Other…', command: 'colorPicker', action: () => openColorPicker() },
    ];
  }

  function openColorPicker() {
    const range = savedRange;
    el.fontColor.onchange = () => { savedRange = range; setTextColor(el.fontColor.value); };
    el.fontColor.click();
  }

  function currentBlock() {
    try { return (document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch (e) { return ''; }
  }

  function paragraphItems() {
    const b = currentBlock();
    return [
      { label: 'Title', keys: KEYS.h1, checked: b === 'h1', action: () => runCommand('h1') },
      { label: 'Heading', keys: KEYS.h2, checked: b === 'h2', action: () => runCommand('h2') },
      { label: 'Body', keys: KEYS.body, checked: b !== 'h1' && b !== 'h2', action: () => runCommand('body') },
      { separator: true },
      { label: 'Bulleted List', keys: KEYS.bullets, action: () => runCommand('bullets') },
      { label: 'Numbered List', keys: KEYS.numbers, action: () => runCommand('numbers') },
      { label: 'To-Do Checkbox', keys: KEYS.todo, action: () => runCommand('todo') },
    ];
  }

  function overflowItems() {
    const listsHidden = getComputedStyle(el.toolbar.querySelector('.segmented.lists')).display === 'none';
    return [
      ...(listsHidden ? [
        { label: 'Bulleted List', keys: KEYS.bullets, action: () => runCommand('bullets') },
        { label: 'Numbered List', keys: KEYS.numbers, action: () => runCommand('numbers') },
        { label: 'To-Do Checkbox', keys: KEYS.todo, action: () => runCommand('todo') },
        { separator: true },
      ] : []),
      { label: 'Highlight', keys: KEYS.highlight, action: () => runCommand('highlight') },
      { label: 'Text Colour', submenu: textColorItems() },
      { label: 'Add Link…', keys: KEYS.link, action: () => runCommand('link') },
      { label: 'Insert Table…', action: () => runCommand('table') },
      { label: 'Insert Image…', keys: KEYS.image, command: 'image', action: () => runCommand('image') },
      { separator: true },
      { label: 'Clear Formatting', action: () => runCommand('clear') },
    ];
  }

  // ---------- Commands (toolbar, menus and keyboard all go through here) ----------

  const KEYS = {
    newPage: 'cmd+n', newSubpage: isMac ? 'alt+cmd+n' : null, // Ctrl+Alt is AltGr on Windows newSection: 'shift+cmd+n',
    import: 'cmd+o', export: 'shift+cmd+e', find: 'cmd+f',
    toggleSidebar: isMac ? 'ctrl+cmd+s' : 'shift+cmd+l',
    textBigger: 'cmd+=', textSmaller: 'cmd+-', textActual: 'cmd+0',
    bold: 'cmd+b', italic: 'cmd+i', underline: 'cmd+u', strike: 'shift+cmd+x',
    h1: isMac ? 'alt+cmd+1' : 'shift+cmd+1', h2: isMac ? 'alt+cmd+2' : 'shift+cmd+2', body: isMac ? 'alt+cmd+0' : 'shift+cmd+0',
    bullets: 'shift+cmd+7', numbers: 'shift+cmd+8', todo: 'cmd+1',
    highlight: 'shift+cmd+h', link: 'cmd+k', image: 'shift+cmd+i',
  };

  const COMMANDS = {
    newPage: () => newPageDialog(),
    newSubpage: () => (page() ? newPageDialog(page().id) : newPageDialog()),
    newSection: () => newSection_(),
    newNotebook: () => newNotebookDialog(),
    import: () => importData(),
    export: () => exportData(),
    find: () => { el.searchInput.focus(); el.searchInput.select(); },
    toggleSidebar: () => toggleSidebar(),
    textBigger: () => setTextScale(1),
    textSmaller: () => setTextScale(-1),
    textActual: () => setTextScale(0),
    bold: () => exec('bold'),
    italic: () => exec('italic'),
    underline: () => exec('underline'),
    strike: () => exec('strikeThrough'),
    h1: () => exec('formatBlock', 'H1'),
    h2: () => exec('formatBlock', 'H2'),
    body: () => exec('formatBlock', 'P'),
    bullets: () => exec('insertUnorderedList'),
    numbers: () => exec('insertOrderedList'),
    todo: () => toggleTodo(),
    highlight: () => exec('hiliteColor', HIGHLIGHT),
    fontColor: () => showMenuBelow(el.toolbar.querySelector('[data-command="fontColor"]'), textColorItems()),
    colorPicker: () => openColorPicker(),
    link: () => insertLink(),
    table: () => insertTable(),
    image: () => pickImages(),
    clear: () => exec('removeFormat'),
    paragraphMenu: () => showMenuBelow(el.headingBtn, paragraphItems()),
    overflowMenu: () => showMenuBelow(el.overflowBtn, overflowItems()),
    indentPage: () => indentPage(1),
    outdentPage: () => indentPage(-1),
  };

  function runCommand(name) {
    hideTooltip();
    const fn = COMMANDS[name];
    if (fn) fn();
  }
  // Native menu items are dispatched here by the desktop shell (as a user gesture, so pickers can open).
  window.__notebookCommand = runCommand;

  el.toolbar.addEventListener('mousedown', (e) => {
    // Keep the editor selection when clicking toolbar buttons.
    if (e.target.closest('button')) e.preventDefault();
  });

  el.toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-command]');
    if (btn) runCommand(btn.dataset.command);
  });

  el.addPageBtn.addEventListener('click', () => runCommand('newPage'));

  async function pickImages() {
    const range = savedRange;
    if (desktop) {
      const files = await desktop.openImages();
      if (!files || !files.length) return;
      savedRange = range;
      insertImages(files.map((f) => new File([Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0))], f.name, { type: f.type })));
    } else {
      el.imageInput.click();
    }
  }

  el.imageInput.addEventListener('change', () => {
    const files = [...el.imageInput.files];
    el.imageInput.value = '';
    insertImages(files);
  });

  const IMAGE_MAX_SIDE = 1600;
  const IMAGE_KEEP_BYTES = 300 * 1024;

  const readAsDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  // Large photos are scaled down and re-encoded so they fit in storage (browser storage is ~5 MB in total).
  async function imageToDataUrl(file) {
    const original = await readAsDataUrl(file);
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return original;
    const img = new Image();
    img.src = original;
    await img.decode();
    const scale = Math.min(1, IMAGE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size <= IMAGE_KEEP_BYTES) return original;
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/webp', 0.85);
    return out.startsWith('data:image/webp') && out.length < original.length ? out : original;
  }

  // Inserts into the note being edited; with no note selected, starts a new one (at x/y if given).
  async function insertImages(files, x, y) {
    files = [...files].filter((f) => f && f.type.startsWith('image/'));
    if (!files.length) return;
    if (!page()) { showAlert('Create a page first.'); return; }
    const range = savedRange;
    let html = '';
    for (const f of files) {
      try {
        html += `<p><img src="${await imageToDataUrl(f)}" alt=""></p>`;
      } catch (e) {
        showAlert(`The image \u201C${f.name || 'pasted image'}\u201D couldn\u2019t be read.`);
      }
    }
    if (!html) return;
    savedRange = range;
    ensureBody(x, y);
    insertHtml(html + '<p><br></p>');
  }

  // Dropping files anywhere else must not navigate the app away.
  ['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => {
    if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
  }));

  el.canvas.addEventListener('drop', (e) => {
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const body = e.target.closest('.body');
    if (body) {
      const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
      body.focus();
      if (r && body.contains(r.startContainer)) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      }
      insertImages(files);
    } else {
      const rect = el.canvas.getBoundingClientRect();
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      savedRange = null;
      insertImages(files, e.clientX - rect.left, e.clientY - rect.top);
    }
  });

  el.canvas.addEventListener('paste', (e) => {
    if (!e.target.closest('.body')) return;
    const items = [...(e.clipboardData.items || [])];
    const images = items.filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile());
    if (images.length) {
      e.preventDefault();
      insertImages(images);
      return;
    }
    const html = e.clipboardData.getData('text/html');
    if (html) {
      e.preventDefault();
      insertHtml(sanitize(html));
    }
  });

  el.canvas.addEventListener('keydown', (e) => {
    if (!e.target.closest('.body')) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      exec(e.shiftKey ? 'outdent' : 'indent');
    }
  });

  document.execCommand('defaultParagraphSeparator', false, 'p');

  // ---------- Drag and drop (sections & pages) ----------

  let drag = null; // { type: 'section'|'page', id }

  function clearDropMarks() {
    document.querySelectorAll('.drop-before,.drop-into,.dragging').forEach((n) =>
      n.classList.remove('drop-before', 'drop-into', 'dragging'));
  }

  el.sectionList.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    drag = { type: 'section', id: li.dataset.id };
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', li.dataset.id);
  });

  el.pageList.addEventListener('dragstart', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    drag = { type: 'page', id: li.dataset.id };
    li.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', li.dataset.id);
  });

  document.addEventListener('dragend', () => { drag = null; clearDropMarks(); });

  el.sectionList.addEventListener('dragover', (e) => {
    if (!drag) return;
    e.preventDefault();
    clearDropMarks();
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    li.classList.add(drag.type === 'page' ? 'drop-into' : 'drop-before');
  });

  el.sectionList.addEventListener('drop', (e) => {
    if (!drag) return;
    e.preventDefault();
    const nb = notebook();
    const li = e.target.closest('li[data-id]');
    if (drag.type === 'section') {
      const from = nb.sections.findIndex((s) => s.id === drag.id);
      const [moved] = nb.sections.splice(from, 1);
      const to = li ? nb.sections.findIndex((s) => s.id === li.dataset.id) : nb.sections.length;
      nb.sections.splice(to, 0, moved);
      save(); renderSections();
    } else if (li && li.dataset.id !== section().id) {
      movePage(section(), drag.id, li.dataset.id, null);
    }
    drag = null;
    clearDropMarks();
  });

  // Dropping on the top part of a page puts the dragged page before it; lower down makes it a subpage.
  function pageDropTarget(e) {
    const s = section();
    const from = s.pages.findIndex((p) => p.id === drag.id);
    if (from < 0) return null;
    const li = e.target.closest('li[data-id]');
    if (!li) return { li: null, mode: 'end', from };
    const ti = s.pages.findIndex((p) => p.id === li.dataset.id);
    if (ti >= from && ti < from + subtreeSize(s.pages, from)) return null; // onto itself or its own subpages
    const rect = li.getBoundingClientRect();
    return { li, mode: e.clientY < rect.top + rect.height * 0.35 ? 'before' : 'into', from };
  }

  el.pageList.addEventListener('dragover', (e) => {
    if (!drag || drag.type !== 'page') return;
    clearDropMarks();
    const t = pageDropTarget(e);
    if (!t) return;
    e.preventDefault();
    if (t.li) t.li.classList.add(t.mode === 'before' ? 'drop-before' : 'drop-into');
  });

  el.pageList.addEventListener('drop', (e) => {
    if (!drag || drag.type !== 'page') return;
    const t = pageDropTarget(e);
    drag = null;
    clearDropMarks();
    if (!t) return;
    e.preventDefault();
    const s = section();
    const target = t.li && s.pages.find((p) => p.id === t.li.dataset.id);
    const group = s.pages.splice(t.from, subtreeSize(s.pages, t.from));
    if (t.mode === 'end') insertSubtree(group, s, s.pages.length, 0);
    else if (t.mode === 'into') placeSubtree(group, s, target);
    else insertSubtree(group, s, s.pages.indexOf(target), target.level);
    save(); render();
  });

  // ---------- Search ----------

  function renderSearch() {
    const q = el.searchInput.value.trim().toLowerCase();
    const searching = !!q;
    el.pageList.classList.toggle('hidden', searching);
    el.searchResults.classList.toggle('hidden', !searching);
    el.addPageBtn.classList.toggle('hidden', searching);
    if (!searching) { renderPages(); return; }

    el.searchResults.innerHTML = '';
    let count = 0;
    for (const nb of state.notebooks) {
      for (const s of nb.sections) {
        for (const p of s.pages) {
          const title = p.title || 'Untitled Page';
          const text = pageText(p);
          const hayTitle = title.toLowerCase();
          const hayText = text.toLowerCase();
          if (!hayTitle.includes(q) && !hayText.includes(q)) continue;
          count++;
          const li = document.createElement('li');
          li.setAttribute('role', 'option');
          li.setAttribute('aria-selected', 'false');
          li.tabIndex = -1;
          li.dataset.nb = nb.id;
          li.dataset.section = s.id;
          li.dataset.page = p.id;
          const pos = hayText.indexOf(q);
          const snippet = pos >= 0 ? text.slice(Math.max(0, pos - 25), pos + q.length + 40) : '';
          li.innerHTML = `<span class="label"><span class="title">${highlight(title, q)}</span>` +
            `<span class="where">${escapeHtml(nb.name)} \u203A ${escapeHtml(s.name)}</span>` +
            (snippet ? `<span class="where">${highlight(snippet, q)}</span>` : '') + '</span>';
          el.searchResults.appendChild(li);
        }
      }
    }
    el.pagesHeader.textContent = 'Search Results';
    el.pagesCount.textContent = `${count} found`;
    const first = el.searchResults.firstChild;
    if (first) { first.tabIndex = 0; first.setAttribute('aria-selected', 'true'); }
  }

  function highlight(text, q) {
    const lower = text.toLowerCase();
    let out = '', i = 0, pos;
    while ((pos = lower.indexOf(q, i)) >= 0) {
      out += escapeHtml(text.slice(i, pos)) + '<mark>' + escapeHtml(text.slice(pos, pos + q.length)) + '</mark>';
      i = pos + q.length;
    }
    return out + escapeHtml(text.slice(i));
  }

  el.searchInput.addEventListener('input', renderSearch);
  el.searchResults.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-page]');
    if (li) openSearchResult(li);
  });

  // ---------- Menus ----------
  // Items: { label, action, keys, checked, disabled, danger, color, submenu, separator, command }.
  // The desktop app shows real native menus; the browser build draws a macOS-style menu.

  let menuReturnFocus = null;

  async function showMenu(x, y, items, owner) {
    hideTooltip();
    if (desktop) {
      const actions = [];
      const toTemplate = (list) => list.map((it) => {
        if (it.separator) return { type: 'separator' };
        if (it.submenu) return { label: it.label, submenu: toTemplate(it.submenu) };
        actions.push(it);
        return {
          id: String(actions.length - 1),
          label: it.label,
          type: it.checked !== undefined ? 'checkbox' : 'normal',
          checked: !!it.checked,
          enabled: !it.disabled,
          accelerator: it.keys ? toAccelerator(it.keys) : undefined,
          command: it.command,
        };
      });
      if (owner) owner.setAttribute('aria-expanded', 'true');
      const id = await desktop.popupMenu(toTemplate(items), Math.round(x), Math.round(y));
      if (owner) owner.setAttribute('aria-expanded', 'false');
      const chosen = id != null ? actions[+id] : null;
      if (chosen && !chosen.command) chosen.action();
      return;
    }
    menuReturnFocus = document.activeElement;
    const menu = buildMenu(items);
    el.contextMenu.replaceWith(menu);
    el.contextMenu = menu;
    menu.id = 'contextMenu';
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) + 'px';
    if (owner) { owner.setAttribute('aria-expanded', 'true'); menu.owner = owner; }
    menu.focus();
  }

  function showMenuBelow(btn, items) {
    const r = btn.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, items, btn);
  }

  function toAccelerator(spec) {
    const map = { cmd: 'CmdOrCtrl', ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', backspace: 'Backspace', enter: 'Enter', '=': 'Plus' };
    return spec.split('+').map((k) => map[k] || k.toUpperCase()).join('+');
  }

  function buildMenu(items) {
    const ul = document.createElement('ul');
    ul.className = 'menu';
    ul.setAttribute('role', 'menu');
    ul.tabIndex = -1;
    for (const it of items) {
      const li = document.createElement('li');
      if (it.separator) {
        li.className = 'sep';
        li.setAttribute('role', 'separator');
        ul.appendChild(li);
        continue;
      }
      li.setAttribute('role', it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem');
      if (it.checked !== undefined) li.setAttribute('aria-checked', String(!!it.checked));
      if (it.checked) li.insertAdjacentHTML('beforeend', '<span class="menu-check">✓</span>');
      if (it.color) {
        const dot = document.createElement('span');
        dot.className = 'menu-dot';
        dot.style.background = it.color;
        li.appendChild(dot);
      }
      const label = document.createElement('span');
      label.className = 'menu-label';
      label.textContent = it.label;
      li.appendChild(label);
      if (it.keys) {
        const k = document.createElement('span');
        k.className = 'menu-keys';
        k.textContent = formatKeys(it.keys);
        li.appendChild(k);
      }
      if (it.danger) li.classList.add('danger');
      if (it.disabled) { li.classList.add('disabled'); li.setAttribute('aria-disabled', 'true'); }
      if (it.submenu) {
        li.classList.add('has-sub');
        li.setAttribute('aria-haspopup', 'menu');
        li.subItems = it.submenu;
      }
      li.item = it;
      ul.appendChild(li);
    }
    return ul;
  }

  function menuRows(menu) { return [...menu.children].filter((li) => !li.classList.contains('sep') && !li.classList.contains('disabled')); }

  function setCurrent(menu, li) {
    [...menu.children].forEach((x) => x.classList.toggle('current', x === li));
    if (li && li.subItems) openSubmenu(li); else closeSubmenus(menu);
  }

  function openSubmenu(li) {
    if (li.querySelector('.menu')) return;
    closeSubmenus(li.parentElement);
    const sub = buildMenu(li.subItems);
    sub.classList.remove('hidden');
    li.appendChild(sub);
    const r = sub.getBoundingClientRect();
    if (r.right > window.innerWidth - 8) { sub.style.left = 'auto'; sub.style.right = '100%'; }
  }

  function closeSubmenus(menu) {
    [...menu.children].forEach((li) => { const sub = li.querySelector(':scope > .menu'); if (sub) sub.remove(); });
  }

  function hideMenu(restoreFocus) {
    const menu = el.contextMenu;
    if (menu.classList.contains('hidden')) return;
    menu.classList.add('hidden');
    menu.innerHTML = '';
    if (menu.owner) { menu.owner.setAttribute('aria-expanded', 'false'); menu.owner = null; }
    if (restoreFocus && menuReturnFocus && menuReturnFocus.isConnected) menuReturnFocus.focus();
  }

  function activate(li) {
    if (!li || !li.item || li.classList.contains('disabled')) return;
    if (li.subItems) { openSubmenu(li); const sub = li.querySelector('.menu'); setCurrent(sub, menuRows(sub)[0]); return; }
    hideMenu(true);
    li.item.action();
  }

  document.addEventListener('mouseover', (e) => {
    const li = e.target.closest && e.target.closest('.menu > li');
    if (li && !li.classList.contains('sep')) setCurrent(li.parentElement, li.classList.contains('disabled') ? null : li);
  });
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.menu')) { e.preventDefault(); return; } // keep editor selection
    hideMenu(false);
  });
  document.addEventListener('click', (e) => {
    const li = e.target.closest('.menu > li');
    if (li && el.contextMenu.contains(li)) activate(li);
  });
  window.addEventListener('blur', () => hideMenu(false));
  window.addEventListener('resize', () => hideMenu(false));

  function menuKeydown(e) {
    const root = el.contextMenu;
    if (root.classList.contains('hidden')) return false;
    // The innermost menu that has a highlighted row (or the root).
    let menu = root;
    for (;;) {
      const cur = [...menu.children].find((x) => x.classList.contains('current'));
      const sub = cur && cur.querySelector(':scope > .menu');
      if (sub && [...sub.children].some((x) => x.classList.contains('current'))) menu = sub; else break;
    }
    const rows = menuRows(menu);
    const cur = rows.find((x) => x.classList.contains('current'));
    const idx = rows.indexOf(cur);
    if (e.key === 'ArrowDown') setCurrent(menu, rows[(idx + 1) % rows.length]);
    else if (e.key === 'ArrowUp') setCurrent(menu, rows[(idx - 1 + rows.length) % rows.length]);
    else if (e.key === 'ArrowRight' && cur && cur.subItems) { openSubmenu(cur); const sub = cur.querySelector('.menu'); setCurrent(sub, menuRows(sub)[0]); }
    else if (e.key === 'ArrowLeft' && menu !== root) { const parentLi = menu.parentElement; menu.remove(); setCurrent(parentLi.parentElement, parentLi); closeSubmenus(parentLi.parentElement); }
    else if (e.key === 'Enter' || e.key === ' ') activate(cur);
    else if (e.key === 'Escape') hideMenu(true);
    else if (e.key === 'Tab') hideMenu(false);
    else return true; // typing: let it through
    e.preventDefault();
    return true;
  }

  // ---------- Alerts and sheets ----------

  function askConfirm({ message, detail = '', okLabel = 'OK', destructive = false }) {
    if (desktop) return desktop.confirm({ message, detail, okLabel, destructive });
    return showSheetAlert({ message, detail, okLabel, cancel: true, destructive });
  }

  function showAlert(message, detail = '') {
    if (desktop) return desktop.alert({ message, detail });
    return showSheetAlert({ message, detail, okLabel: 'OK', cancel: false });
  }

  function showSheetAlert({ message, detail, okLabel, cancel, destructive }) {
    const d = el.confirmDialog;
    el.confirmHeading.textContent = message;
    el.confirmDetail.textContent = detail;
    el.confirmOk.textContent = okLabel;
    el.confirmOk.classList.toggle('destructive', !!destructive);
    el.confirmOk.classList.toggle('default', !destructive);
    el.confirmCancel.classList.toggle('default', !!destructive);
    el.confirmCancel.classList.toggle('hidden', !cancel);
    return new Promise((resolve) => {
      d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
      d.returnValue = '';
      d.showModal();
      // Destructive actions default to Cancel, as the HIG recommends.
      (destructive ? el.confirmCancel : el.confirmOk).focus();
    });
  }

  function notify(title, body) {
    announce(`${title}. ${body}`);
    if (desktop) desktop.notify({ title, body });
  }

  // ---------- Import / export ----------

  async function exportData() {
    saveNow();
    const json = JSON.stringify(state, null, 2);
    const name = `Notebook Export ${new Date().toISOString().slice(0, 10)}.json`;
    if (desktop) {
      const saved = await desktop.exportFile({ json, defaultName: name });
      if (saved) notify('Export Complete', `Saved ${saved.split(/[\\/]/).pop()}`);
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importData() {
    if (!desktop) { el.importInput.click(); return; }
    const file = await desktop.importFile();
    if (file) importText(file.text, file.name);
  }

  el.importInput.addEventListener('change', () => {
    const file = el.importInput.files[0];
    el.importInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importText(reader.result, file.name);
    reader.readAsText(file);
  });

  async function importText(text, name) {
    let data;
    try { data = JSON.parse(text); } catch (e) {
      showAlert(`“${name}” couldn’t be imported.`, 'The file isn’t valid JSON.');
      return;
    }
    if (!isValidState(data) || !data.notebooks.length) {
      showAlert(`“${name}” couldn’t be imported.`, 'It isn’t a notebook export. See the README for the import format.');
      return;
    }
    const ok = await askConfirm({
      message: 'Replace all notebooks with the imported data?',
      detail: 'Your current notebooks will be replaced. Export them first if you want to keep a copy.',
      okLabel: 'Replace', destructive: true,
    });
    if (!ok) return;
    state = normalizeState(data);
    renderedPageId = null;
    saveNow();
    render();
    const pages = state.notebooks.reduce((n, nb) => n + nb.sections.reduce((m, s) => m + s.pages.length, 0), 0);
    notify('Import Complete', `${state.notebooks.length} notebook${state.notebooks.length === 1 ? '' : 's'}, ${pages} page${pages === 1 ? '' : 's'}`);
  }

  // ---------- Preferences, sidebar and splitters ----------

  function applyPrefs() {
    const prefs = state.prefs;
    const root = document.documentElement.style;
    let pagesW = prefs.pagesWidth;
    const room = window.innerWidth - (prefs.sidebarHidden ? 0 : prefs.sidebarWidth) - 380;
    if (pagesW > room) pagesW = Math.max(200, room);
    root.setProperty('--sidebar-w', prefs.sidebarWidth + 'px');
    root.setProperty('--pages-w', pagesW + 'px');
    root.setProperty('--note-scale', prefs.textScale);
    document.body.classList.toggle('sidebar-hidden', prefs.sidebarHidden);
    const label = prefs.sidebarHidden ? 'Show Sidebar' : 'Hide Sidebar';
    el.toggleSidebarBtn.setAttribute('aria-label', label);
    el.toggleSidebarBtn.dataset.tip = label;
    el.toggleSidebarBtn.dataset.keys = KEYS.toggleSidebar;
    el.toggleSidebarBtn.setAttribute('aria-expanded', String(!prefs.sidebarHidden));
    if (desktop) desktop.setMenuState({ sidebarHidden: prefs.sidebarHidden });
  }

  function toggleSidebar() {
    state.prefs.sidebarHidden = !state.prefs.sidebarHidden;
    if (state.prefs.sidebarHidden && el.sidebar.contains(document.activeElement)) el.pageList.focus();
    applyPrefs();
    save();
  }

  function setTextScale(dir) {
    const i = TEXT_SCALES.indexOf(state.prefs.textScale);
    const next = dir === 0 ? 1 : TEXT_SCALES[Math.max(0, Math.min(TEXT_SCALES.length - 1, (i < 0 ? 1 : i) + dir))];
    state.prefs.textScale = next;
    applyPrefs();
    save();
    announce(`Text size ${Math.round(next * 100)} percent`);
  }

  el.toggleSidebarBtn.addEventListener('click', () => runCommand('toggleSidebar'));
  window.addEventListener('resize', applyPrefs);

  function startSplitDrag(e, key, min, max, sign = 1) {
    e.preventDefault();
    const start = e.clientX;
    const orig = state.prefs[key];
    document.body.classList.add('resizing');
    const move = (ev) => {
      state.prefs[key] = Math.max(min, Math.min(max, orig + sign * (ev.clientX - start)));
      applyPrefs();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
      save();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  el.sidebarSplitter.addEventListener('pointerdown', (e) => startSplitDrag(e, 'sidebarWidth', 170, 360));
  el.pagesSplitter.addEventListener('pointerdown', (e) => startSplitDrag(e, 'pagesWidth', 200, 480));

  // ---------- Tooltips ----------
  // Shown after a short delay; once one is visible, neighbouring ones appear immediately (as on macOS).

  let tipTimer = null;
  let tipTarget = null;
  let tipWarmUntil = 0;

  function keysForTip(node) {
    return node.dataset.keys ? formatKeys(node.dataset.keys) : '';
  }

  function showTooltip(node) {
    const t = el.tooltip;
    t.textContent = node.dataset.tip;
    const keys = keysForTip(node);
    if (keys) {
      const k = document.createElement('span');
      k.className = 'keys';
      k.textContent = keys;
      t.appendChild(k);
    }
    const r = node.getBoundingClientRect();
    t.style.left = '0px';
    t.style.top = '0px';
    t.classList.add('visible');
    const tr = t.getBoundingClientRect();
    t.style.left = Math.max(6, Math.min(r.left + r.width / 2 - tr.width / 2, window.innerWidth - tr.width - 6)) + 'px';
    const below = r.bottom + 6;
    t.style.top = (below + tr.height > window.innerHeight - 6 ? r.top - tr.height - 6 : below) + 'px';
  }

  function hideTooltip() {
    clearTimeout(tipTimer);
    if (el.tooltip.classList.contains('visible')) tipWarmUntil = Date.now() + 400;
    el.tooltip.classList.remove('visible');
    tipTarget = null;
  }

  document.addEventListener('pointerover', (e) => {
    const node = e.target.closest && e.target.closest('[data-tip]');
    if (node === tipTarget) return;
    hideTooltip();
    if (!node || e.pointerType === 'touch') return;
    tipTarget = node;
    tipTimer = setTimeout(() => showTooltip(node), Date.now() < tipWarmUntil ? 0 : 700);
  });
  document.addEventListener('pointerdown', hideTooltip, true);
  document.addEventListener('keydown', hideTooltip, true);
  document.addEventListener('scroll', hideTooltip, true);

  // Screen readers get the shortcut through aria-keyshortcuts.
  function ariaKeys(spec) {
    const map = { cmd: isMac ? 'Meta' : 'Control', ctrl: 'Control', alt: 'Alt', shift: 'Shift', '=': 'Plus' };
    return spec.split('+').map((k) => map[k] || k.toUpperCase()).join('+');
  }
  document.querySelectorAll('[data-command]').forEach((b) => {
    const k = KEYS[b.dataset.command];
    if (k) b.dataset.keys = k;
  });
  el.addPageBtn.dataset.keys = KEYS.newPage;
  el.addSectionBtn.dataset.keys = KEYS.newSection;
  document.querySelectorAll('[data-keys]').forEach((b) => b.setAttribute('aria-keyshortcuts', ariaKeys(b.dataset.keys)));

  // ---------- Keyboard navigation in lists ----------

  function contextMenuForRow(list, li) {
    const r = li.getBoundingClientRect();
    if (list === el.sectionList) showMenu(r.left + 20, r.bottom, sectionMenuItems(li));
    else if (list === el.pageList) showMenu(r.left + 20, r.bottom, pageMenuItems(li.dataset.id));
  }

  el.sectionList.addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li || li.querySelector('input')) return;
    const rows = [...el.sectionList.children];
    const i = rows.indexOf(li);
    const mod = isMac ? e.metaKey : e.ctrlKey;
    let target = null;
    if (e.key === 'ArrowDown') target = rows[i + 1];
    else if (e.key === 'ArrowUp') target = rows[i - 1];
    else if (e.key === 'Home') target = rows[0];
    else if (e.key === 'End') target = rows[rows.length - 1];
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusSelected(el.pageList); return; }
    else if (e.key === 'Enter') { e.preventDefault(); startRename(li, notebook().sections.find((x) => x.id === li.dataset.id), 'name'); return; }
    else if (mod && e.key === 'Backspace') { e.preventDefault(); deleteSection(notebook().sections.find((x) => x.id === li.dataset.id)); return; }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); contextMenuForRow(el.sectionList, li); return; }
    else return;
    e.preventDefault();
    if (target) navigateTo(notebook().id, target.dataset.id);
  });

  el.pageList.addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const s = section();
    const rows = [...el.pageList.children];
    const i = rows.indexOf(li);
    const idx = s.pages.findIndex((p) => p.id === li.dataset.id);
    const p = s.pages[idx];
    const mod = isMac ? e.metaKey : e.ctrlKey;
    let target = null;
    if (e.key === 'ArrowDown') target = rows[i + 1];
    else if (e.key === 'ArrowUp') target = rows[i - 1];
    else if (e.key === 'Home') target = rows[0];
    else if (e.key === 'End') target = rows[rows.length - 1];
    else if (e.key === 'ArrowRight' && !mod) {
      if (hasChildren(s.pages, idx) && p.collapsed) { p.collapsed = false; save(); renderPages(); }
      else if (hasChildren(s.pages, idx)) target = rows[i + 1];
    } else if (e.key === 'ArrowLeft' && !mod) {
      if (hasChildren(s.pages, idx) && !p.collapsed) { p.collapsed = true; save(); renderPages(); }
      else {
        const pi = parentIndex(s.pages, idx);
        if (pi >= 0) target = el.pageList.querySelector(`li[data-id="${s.pages[pi].id}"]`);
        else { e.preventDefault(); if (!state.prefs.sidebarHidden) focusSelected(el.sectionList); return; }
      }
    } else if (e.key === 'Enter') { e.preventDefault(); el.pageTitle.focus(); el.pageTitle.select(); return; }
    else if (mod && e.key === 'Backspace') { e.preventDefault(); deletePage(p.id); return; }
    else if (mod && e.key === ']') { e.preventDefault(); indentPage(1); return; }
    else if (mod && e.key === '[') { e.preventDefault(); indentPage(-1); return; }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); contextMenuForRow(el.pageList, li); return; }
    else return;
    e.preventDefault();
    if (target) navigateTo(notebook().id, s.id, target.dataset.id);
  });

  function moveSearchSelection(delta) {
    const rows = [...el.searchResults.children];
    if (!rows.length) return;
    let i = rows.findIndex((r) => r.getAttribute('aria-selected') === 'true');
    i = Math.max(0, Math.min(rows.length - 1, i + delta));
    rows.forEach((r, j) => { r.setAttribute('aria-selected', String(j === i)); r.tabIndex = j === i ? 0 : -1; });
    rows[i].focus();
    rows[i].scrollIntoView({ block: 'nearest' });
  }

  function openSearchResult(li) {
    el.searchInput.value = '';
    renderSearch();
    navigateTo(li.dataset.nb, li.dataset.section, li.dataset.page);
  }

  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && el.searchResults.firstChild) { e.preventDefault(); moveSearchSelection(0); }
    else if (e.key === 'Enter' && el.searchResults.firstChild) { e.preventDefault(); openSearchResult(el.searchResults.firstChild); }
  });

  el.searchResults.addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-page]');
    if (!li) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSearchSelection(1); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (li === el.searchResults.firstChild) el.searchInput.focus(); else moveSearchSelection(-1);
    } else if (e.key === 'Enter') { e.preventDefault(); openSearchResult(li); }
    else if (e.key === 'Escape') { e.preventDefault(); el.searchInput.value = ''; renderSearch(); focusSelected(el.pageList); }
  });

  // ---------- Global shortcuts ----------
  // In the desktop app the native menu bar owns these; the browser build handles them here.

  function eventKeys(e) {
    const code = e.code || '';
    let key = code.startsWith('Key') ? code.slice(3).toLowerCase()
      : code.startsWith('Digit') ? code.slice(5)
      : { Equal: '=', Minus: '-', BracketLeft: '[', BracketRight: ']', Backspace: 'backspace', Enter: 'enter' }[code] || e.key.toLowerCase();
    const parts = [];
    if (isMac && e.ctrlKey) parts.push('ctrl');
    if (e.altKey) parts.push('alt');
    if (e.shiftKey) parts.push('shift');
    if (isMac ? e.metaKey : e.ctrlKey) parts.push('cmd');
    return parts.concat(key).join('+');
  }

  const KEY_TO_COMMAND = Object.fromEntries(Object.entries(KEYS).map(([cmd, k]) => [k, cmd]));

  document.addEventListener('keydown', (e) => {
    if (menuKeydown(e)) return;
    if (e.key === 'Escape') {
      if (document.activeElement === el.searchInput && el.searchInput.value) {
        el.searchInput.value = ''; renderSearch();
      }
      return;
    }
    if (desktop) return;
    const keys = eventKeys(e);
    const cmd = KEY_TO_COMMAND[keys];
    // Let the editor handle its own bold/italic/underline natively.
    if (!cmd || ['bold', 'italic', 'underline'].includes(cmd)) return;
    e.preventDefault();
    runCommand(cmd);
  });

  if (desktop) desktop.onCommand(runCommand);

  render();
})();
