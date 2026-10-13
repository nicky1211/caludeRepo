(() => {
  'use strict';

  const STORAGE_KEY = 'notebook-app-v1';
  const SECTION_COLORS = ['#7719aa', '#2b88d8', '#0b8a00', '#d83b01', '#e3008c', '#b4a000', '#008272', '#5c2e91'];
  const EMPTY_NOTE_HTML = '<p><br></p>';

  const $ = (id) => document.getElementById(id);
  const el = {
    notebookSelect: $('notebookSelect'),
    addNotebookBtn: $('addNotebookBtn'),
    notebookMenuBtn: $('notebookMenuBtn'),
    searchInput: $('searchInput'),
    exportBtn: $('exportBtn'),
    importInput: $('importInput'),
    toolbar: $('toolbar'),
    fontColor: $('fontColor'),
    imageInput: $('imageInput'),
    sectionList: $('sectionList'),
    addSectionBtn: $('addSectionBtn'),
    pageList: $('pageList'),
    pagesHeader: $('pagesHeader'),
    addPageBtn: $('addPageBtn'),
    searchResults: $('searchResults'),
    pageTitle: $('pageTitle'),
    pageMeta: $('pageMeta'),
    canvas: $('canvas'),
    emptyState: $('emptyState'),
    contextMenu: $('contextMenu'),
  };

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
        '<li>Right-click a section or page for more options (rename, color, subpage, delete).</li>' +
        '<li>Use Ctrl+E to search everything, and Ctrl+1 for a to-do checkbox.</li>' +
        '</ul>' +
        '<p><span class="todo" contenteditable="false" data-checked="true"></span>Open the app</p>' +
        '<p><span class="todo" contenteditable="false" data-checked="false"></span>Write your first note</p>',
    });
    const quick = { id: uid(), name: 'Quick Notes', color: SECTION_COLORS[0], pages: [welcome], lastPageId: welcome.id };
    const nb = { id: uid(), name: 'My Notebook', sections: [quick], lastSectionId: quick.id };
    return { notebooks: [nb], activeNotebookId: nb.id };
  }

  // In the desktop app data lives in a file (via electron/preload.js); in a browser it uses localStorage.
  const desktop = window.notebookDesktop || null;

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

  function normalizeState(data) {
    data.notebooks.forEach((nb) => nb.sections.forEach(normalizeLevels));
    if (!data.notebooks.some((n) => n.id === data.activeNotebookId)) data.activeNotebookId = data.notebooks[0].id;
    return data;
  }

  function isValidState(data) {
    return data && Array.isArray(data.notebooks) && data.notebooks.every((nb) =>
      nb && typeof nb.id === 'string' && Array.isArray(nb.sections) && nb.sections.every((s) =>
        s && typeof s.id === 'string' && Array.isArray(s.pages) && s.pages.every((p) =>
          p && typeof p.id === 'string' && Array.isArray(p.notes))));
  }

  let state = loadState();
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
        alert('Could not save your notes' + (e && e.message ? ': ' + e.message : '.') + ' Export your data to keep it.');
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
    renderNotebooks();
    renderSections();
    renderPages();
    renderPage();
    if (el.searchInput.value.trim()) renderSearch();
  }

  function renderNotebooks() {
    el.notebookSelect.innerHTML = '';
    for (const nb of state.notebooks) {
      const opt = document.createElement('option');
      opt.value = nb.id;
      opt.textContent = nb.name;
      el.notebookSelect.appendChild(opt);
    }
    el.notebookSelect.value = notebook().id;
  }

  function renderSections() {
    const nb = notebook();
    const active = section();
    el.sectionList.innerHTML = '';
    for (const s of nb.sections) {
      const li = document.createElement('li');
      li.textContent = s.name;
      li.dataset.id = s.id;
      li.style.borderLeftColor = s.color;
      li.draggable = true;
      if (active && s.id === active.id) li.classList.add('active');
      el.sectionList.appendChild(li);
    }
  }

  function renderPages() {
    const s = section();
    const active = page();
    el.pageList.innerHTML = '';
    el.pagesHeader.textContent = s ? s.name : 'Pages';
    el.addPageBtn.disabled = !s;
    if (!s) return;
    for (const p of s.pages) {
      const li = document.createElement('li');
      li.dataset.id = p.id;
      li.draggable = true;
      if (p.level) li.classList.add('subpage');
      if (active && p.id === active.id) li.classList.add('active');
      const title = document.createElement('span');
      title.textContent = p.title || 'Untitled Page';
      const preview = document.createElement('span');
      preview.className = 'preview';
      preview.textContent = pageText(p).slice(0, 80) || formatDate(p.created);
      li.append(title, preview);
      el.pageList.appendChild(li);
    }
  }

  function updateActivePageListItem() {
    const p = page();
    const li = p && el.pageList.querySelector(`li[data-id="${p.id}"]`);
    if (!li) return;
    li.firstChild.textContent = p.title || 'Untitled Page';
    li.lastChild.textContent = pageText(p).slice(0, 80) || formatDate(p.created);
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
    el.pageMeta.textContent = formatDate(p.created);
    if (renderedPageId === p.id) return; // keep DOM (and caret) intact while editing
    renderedPageId = p.id;
    el.canvas.innerHTML = '';
    for (const n of p.notes) el.canvas.appendChild(buildNote(n));
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
    handle.title = 'Drag to move';

    const body = document.createElement('div');
    body.className = 'body';
    body.contentEditable = 'true';
    body.innerHTML = sanitize(n.html);

    const resize = document.createElement('div');
    resize.className = 'resize';
    resize.title = 'Drag to resize';

    wrap.append(handle, body, resize);
    return wrap;
  }

  // ---------- Notebook actions ----------

  el.notebookSelect.addEventListener('change', () => navigateTo(el.notebookSelect.value));

  el.addNotebookBtn.addEventListener('click', () => {
    const name = prompt('Notebook name:', 'New Notebook');
    if (!name || !name.trim()) return;
    const nb = newNotebook(name.trim());
    state.notebooks.push(nb);
    navigateTo(nb.id);
  });

  el.notebookMenuBtn.addEventListener('click', (e) => {
    const nb = notebook();
    showMenu(e.clientX, e.clientY + 10, [
      { label: 'Rename notebook', action: () => {
        const name = prompt('Rename notebook:', nb.name);
        if (name && name.trim()) { nb.name = name.trim(); save(); render(); }
      } },
      { label: 'Delete notebook', danger: true, action: () => {
        if (state.notebooks.length === 1) { alert('You need at least one notebook.'); return; }
        if (!confirm(`Delete notebook "${nb.name}" and everything in it?`)) return;
        state.notebooks = state.notebooks.filter((n) => n !== nb);
        navigateTo(state.notebooks[0].id);
      } },
    ]);
  });

  // ---------- Section actions ----------

  el.addSectionBtn.addEventListener('click', () => {
    const nb = notebook();
    const s = newSection('New Section', SECTION_COLORS[nb.sections.length % SECTION_COLORS.length]);
    nb.sections.push(s);
    navigateTo(nb.id, s.id);
    startRename(el.sectionList.querySelector(`li[data-id="${s.id}"]`), s, 'name');
  });

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

  el.sectionList.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    e.preventDefault();
    const nb = notebook();
    const s = nb.sections.find((x) => x.id === li.dataset.id);
    const items = [
      { label: 'Rename', action: () => startRename(li, s, 'name') },
      { colors: SECTION_COLORS, action: (c) => { s.color = c; save(); renderSections(); } },
      { label: 'New page in section', action: () => { addPage(s); } },
    ];
    const otherNotebooks = state.notebooks.filter((n) => n !== nb);
    for (const other of otherNotebooks) {
      items.push({ label: `Move to notebook: ${other.name}`, action: () => {
        nb.sections = nb.sections.filter((x) => x !== s);
        other.sections.push(s);
        save(); render();
      } });
    }
    items.push({ label: 'Delete section', danger: true, action: () => {
      if (!confirm(`Delete section "${s.name}" and all its pages?`)) return;
      nb.sections = nb.sections.filter((x) => x !== s);
      if (nb.lastSectionId === s.id) nb.lastSectionId = nb.sections[0] ? nb.sections[0].id : null;
      save(); render();
    } });
    showMenu(e.clientX, e.clientY, items);
  });

  // ---------- Page actions ----------

  function addPage(s = section(), afterIndex = null, level = 0) {
    if (!s) return;
    const p = newPage();
    p.level = level;
    if (afterIndex === null) s.pages.push(p);
    else s.pages.splice(afterIndex + 1, 0, p);
    navigateTo(notebook().id, s.id, p.id);
    el.pageTitle.focus();
  }

  el.addPageBtn.addEventListener('click', () => addPage());

  el.pageList.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li && !li.querySelector('input')) navigateTo(notebook().id, section().id, li.dataset.id);
  });

  el.pageList.addEventListener('dblclick', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    el.pageTitle.focus();
    el.pageTitle.select();
  });

  el.pageList.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    e.preventDefault();
    const nb = notebook();
    const s = section();
    const idx = s.pages.findIndex((x) => x.id === li.dataset.id);
    const p = s.pages[idx];
    const items = [
      { label: 'Rename', action: () => { navigateTo(nb.id, s.id, p.id); el.pageTitle.focus(); el.pageTitle.select(); } },
      { label: 'New page below', action: () => addPage(s, idx + pageGroupSize(s, idx) - 1, p.level) },
      p.level
        ? { label: 'Promote subpage', action: () => { p.level = 0; save(); renderPages(); } }
        : { label: 'Make subpage', action: () => {
            if (idx === 0) { alert('The first page cannot be a subpage.'); return; }
            p.level = 1; save(); renderPages();
          } },
      { label: 'Duplicate', action: () => {
        const copy = JSON.parse(JSON.stringify(p));
        copy.id = uid();
        copy.title = (p.title || 'Untitled Page') + ' (copy)';
        copy.created = copy.updated = now();
        copy.notes.forEach((n) => { n.id = uid(); });
        s.pages.splice(idx + 1, 0, copy);
        navigateTo(nb.id, s.id, copy.id);
      } },
    ];
    for (const target of nb.sections.filter((x) => x !== s)) {
      items.push({ label: `Move to: ${target.name}`, action: () => movePageToSection(s, idx, target) });
    }
    items.push({ label: 'Delete page', danger: true, action: () => {
      if (!confirm(`Delete page "${p.title || 'Untitled Page'}"?`)) return;
      s.pages.splice(idx, 1);
      if (s.pages[idx] && s.pages[idx].level && (idx === 0 || !s.pages[idx - 1])) s.pages[idx].level = 0;
      if (s.lastPageId === p.id) s.lastPageId = (s.pages[idx] || s.pages[idx - 1] || {}).id || null;
      if (renderedPageId === p.id) renderedPageId = null;
      save(); render();
    } });
    showMenu(e.clientX, e.clientY, items);
  });

  // A top-level page "owns" the subpages directly below it.
  function pageGroupSize(s, idx) {
    if (s.pages[idx].level) return 1;
    let n = 1;
    while (s.pages[idx + n] && s.pages[idx + n].level) n++;
    return n;
  }

  function movePageToSection(from, idx, to) {
    const group = from.pages.splice(idx, pageGroupSize(from, idx));
    group[0].level = 0;
    to.pages.push(...group);
    if (from.lastPageId === group[0].id) from.lastPageId = from.pages[0] ? from.pages[0].id : null;
    save(); render();
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

  function insertHtml(html) {
    const body = activeBody();
    if (!body) { alert('Click inside a note first.'); return; }
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

  el.toolbar.addEventListener('mousedown', (e) => {
    // Keep the editor selection when clicking buttons (not the colour/file inputs).
    if (e.target.closest('button')) e.preventDefault();
  });

  el.toolbar.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.cmd) exec(btn.dataset.cmd);
    else if (btn.dataset.block) exec('formatBlock', btn.dataset.block);
    else if (btn.dataset.action === 'todo') toggleTodo();
    else if (btn.dataset.action === 'highlight') exec('hiliteColor', '#fff176');
    else if (btn.dataset.action === 'link') {
      const body = activeBody();
      if (!body) return;
      const range = savedRange;
      const url = prompt('Link URL:', 'https://');
      if (!url || /^\s*javascript:/i.test(url)) return;
      savedRange = range;
      restoreSelection();
      if (window.getSelection().isCollapsed) insertHtml(`<a href="${escapeHtml(url)}">${escapeHtml(url)}</a>`);
      else exec('createLink', url);
    } else if (btn.dataset.action === 'table') {
      const range = savedRange;
      const spec = prompt('Table size (rows x columns):', '3x3');
      const m = spec && spec.match(/^\s*(\d+)\s*[x*,]\s*(\d+)\s*$/i);
      if (!m) return;
      const rows = Math.min(+m[1], 50), cols = Math.min(+m[2], 20);
      const row = '<tr>' + '<td><br></td>'.repeat(cols) + '</tr>';
      savedRange = range;
      insertHtml('<table><tbody>' + row.repeat(rows) + '</tbody></table><p><br></p>');
    }
  });

  el.fontColor.addEventListener('input', () => exec('foreColor', el.fontColor.value));

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
    if (!page()) { alert('Create a page first.'); return; }
    const range = savedRange;
    let html = '';
    for (const f of files) {
      try {
        html += `<p><img src="${await imageToDataUrl(f)}" alt=""></p>`;
      } catch (e) {
        alert(`Could not read image "${f.name || 'pasted image'}".`);
      }
    }
    if (!html) return;
    savedRange = range;
    if (!activeBody()) {
      if (x === undefined) {
        const bottom = Math.max(0, ...[...el.canvas.querySelectorAll('.note')].map((n) => n.offsetTop + n.offsetHeight));
        x = 40; y = bottom + 20;
      }
      createNote(x, y);
      const body = el.canvas.lastElementChild.querySelector('.body');
      body.innerHTML = '';
      body.focus();
    }
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
      const s = section();
      const idx = s.pages.findIndex((p) => p.id === drag.id);
      const target = nb.sections.find((x) => x.id === li.dataset.id);
      if (idx >= 0 && target) movePageToSection(s, idx, target);
    }
    drag = null;
    clearDropMarks();
  });

  el.pageList.addEventListener('dragover', (e) => {
    if (!drag || drag.type !== 'page') return;
    e.preventDefault();
    clearDropMarks();
    const li = e.target.closest('li[data-id]');
    if (li) li.classList.add('drop-before');
  });

  el.pageList.addEventListener('drop', (e) => {
    if (!drag || drag.type !== 'page') return;
    e.preventDefault();
    const s = section();
    const li = e.target.closest('li[data-id]');
    const from = s.pages.findIndex((p) => p.id === drag.id);
    if (from >= 0 && (!li || li.dataset.id !== drag.id)) {
      const group = s.pages.splice(from, pageGroupSize(s, from));
      let to = li ? s.pages.findIndex((p) => p.id === li.dataset.id) : s.pages.length;
      if (to < 0) to = s.pages.length; // dropped onto one of its own subpages
      s.pages.splice(to, 0, ...group);
      if (s.pages[0] && s.pages[0].level) s.pages[0].level = 0;
      save(); renderPages();
    }
    drag = null;
    clearDropMarks();
  });

  // ---------- Search ----------

  function renderSearch() {
    const q = el.searchInput.value.trim().toLowerCase();
    const searching = !!q;
    el.pageList.classList.toggle('hidden', searching);
    el.searchResults.classList.toggle('hidden', !searching);
    el.addPageBtn.classList.toggle('hidden', searching);
    if (!searching) { el.pagesHeader.textContent = section() ? section().name : 'Pages'; return; }

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
          li.dataset.nb = nb.id;
          li.dataset.section = s.id;
          li.dataset.page = p.id;
          const pos = hayText.indexOf(q);
          const snippet = pos >= 0 ? text.slice(Math.max(0, pos - 25), pos + q.length + 40) : '';
          li.innerHTML = `${highlight(title, q)}<span class="where">${escapeHtml(nb.name)} &gt; ${escapeHtml(s.name)}</span>` +
            (snippet ? `<span class="where">${highlight(snippet, q)}</span>` : '');
          el.searchResults.appendChild(li);
        }
      }
    }
    el.pagesHeader.textContent = `${count} result${count === 1 ? '' : 's'}`;
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
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { el.searchInput.value = ''; renderSearch(); }
  });

  el.searchResults.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-page]');
    if (!li) return;
    el.searchInput.value = '';
    renderSearch();
    navigateTo(li.dataset.nb, li.dataset.section, li.dataset.page);
  });

  // ---------- Context menu ----------

  function showMenu(x, y, items) {
    const menu = el.contextMenu;
    menu.innerHTML = '';
    for (const item of items) {
      const li = document.createElement('li');
      if (item.colors) {
        li.className = 'colors';
        for (const c of item.colors) {
          const sw = document.createElement('span');
          sw.className = 'swatch';
          sw.style.background = c;
          sw.addEventListener('click', () => { hideMenu(); item.action(c); });
          li.appendChild(sw);
        }
      } else {
        li.textContent = item.label;
        if (item.danger) li.classList.add('danger');
        li.addEventListener('click', () => { hideMenu(); item.action(); });
      }
      menu.appendChild(li);
    }
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
  }

  function hideMenu() { el.contextMenu.classList.add('hidden'); }

  document.addEventListener('mousedown', (e) => {
    if (!el.contextMenu.contains(e.target) && e.target !== el.notebookMenuBtn) hideMenu();
  });
  window.addEventListener('blur', hideMenu);

  // ---------- Import / export ----------

  el.exportBtn.addEventListener('click', () => {
    saveNow();
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notebook-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  el.importInput.addEventListener('change', () => {
    const file = el.importInput.files[0];
    el.importInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { alert('That file is not valid JSON.'); return; }
      if (!isValidState(data) || !data.notebooks.length) { alert('That file is not a notebook export.'); return; }
      if (!confirm('Replace all current notebooks with the imported data?')) return;
      state = data;
      if (!state.notebooks.some((n) => n.id === state.activeNotebookId)) state.activeNotebookId = state.notebooks[0].id;
      renderedPageId = null;
      saveNow();
      render();
    };
    reader.readAsText(file);
  });

  // ---------- Keyboard shortcuts ----------

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      el.searchInput.focus();
      el.searchInput.select();
    } else if (mod && e.key === '1' && document.activeElement.closest('.note .body')) {
      e.preventDefault();
      toggleTodo();
    } else if (e.key === 'Escape') {
      hideMenu();
    }
  });

  render();
})();
