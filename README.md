# Notebook

A OneNote-style note-taking app. It runs in a browser or as a desktop app for macOS and Windows.

## Desktop app (macOS / Windows)

Download the installer from the latest run of the **Build desktop apps** workflow (GitHub Actions > run > Artifacts):

- `Notebook-macOS`: `Notebook-<version>-arm64.dmg` (Apple Silicon) and `Notebook-<version>-x64.dmg` (Intel)
- `Notebook-Windows`: `Notebook-Setup-<version>.exe`

The builds are not code-signed, so the first launch needs one extra step:

- **macOS:** open the DMG and drag Notebook to Applications. The first time, right-click the app and choose Open, then Open again. If macOS says the app is damaged, run `xattr -cr /Applications/Notebook.app`.
- **Windows:** if SmartScreen appears, click "More info" then "Run anyway".

### Where your notes are stored

The desktop app saves everything to a file and reloads it on every start:

- macOS: `~/Library/Application Support/Notebook/notebook-data.json`
- Windows: `%APPDATA%\Notebook\notebook-data.json`

A copy of the previous session's data is kept next to it as `notebook-data.backup.json`. File > Open Data Folder opens this folder. Uninstalling or updating the app does not delete your notes.

### Build it yourself

```
npm install
npm start            # run the desktop app
npm run dist:mac     # build the .dmg files (must run on macOS)
npm run dist:win     # build the .exe installer
```

Output goes to `dist/`.

## Browser version

Open `index.html` in a browser, or serve the folder with `python3 -m http.server 8000`. In a browser, notes are stored in that browser's localStorage, which holds about 5 MB.

## Features

- Notebooks > Sections > Pages, with subpages nested to any depth
- New page dialog: give it a title and choose where it goes, either under any existing page (in any section or notebook) or as a separate top-level page
- Move a page and its subpages later with right-click > Move under..., or by dragging (drop on the top edge of a page to place it before that page, lower down to make it a subpage)
- Collapse and expand subpages; the breadcrumb under the page title shows where the page sits
- Free-form page canvas: click anywhere to add a note container; drag its top bar to move it and its right edge to resize
- Rich text: bold, italic, underline, strikethrough, headings, lists, to-do checkboxes, highlight, font color, links, tables
- Images: toolbar button (several at once), paste, or drag-and-drop onto a note or the page. Large photos are scaled to 1600px
- Search across all notebooks (Ctrl+E)
- Export/Import as JSON for backup or moving between machines

## Shortcuts

| Keys | Action |
| --- | --- |
| Ctrl/Cmd+N | New page (desktop app) |
| Ctrl/Cmd+E | Search |
| Ctrl/Cmd+1 | Toggle to-do checkbox on the current line |
| Ctrl/Cmd+B / I / U | Bold / italic / underline |
| Tab / Shift+Tab | Indent / outdent |
| Ctrl/Cmd+click link | Open link |
