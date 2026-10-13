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
- Search across all notebooks (⌘F)
- Export/Import as JSON for backup or moving between machines

## macOS look and feel

- Full-height translucent sidebar (vibrancy) with the window controls on it; the rest of the window stays opaque
- Native menu bar, right-click menus, warning sheets and open/save panels; notifications after import and export
- Follows the system accent colour, light/dark mode, Reduce Motion, Increase Contrast and Reduce Transparency
- Toolbar buttons show hover, pressed and active states; tooltips appear after a short delay and show the shortcut
- VoiceOver labels and roles throughout; full keyboard navigation of sections, pages, menus and dialogs
- Remembers window size, position, sidebar widths and text size; toolbar tools collapse into a More menu in narrow windows
- Spelling suggestions and Look Up in notes

## Import file format

Import takes a JSON file (UTF-8) and **replaces all current data**, so export first if you want a backup. Export produces the same format. See `samples/sample-import.json` for a full example.

```
{
  "activeNotebookId": "nb-1",            optional: notebook shown after import
  "notebooks": [
    {
      "id": "nb-1",                      required, unique text
      "name": "Work",
      "sections": [
        {
          "id": "sec-1",                 required, unique text
          "name": "Projects",
          "color": "#2b88d8",            optional, any CSS colour
          "pages": [
            {
              "id": "pg-1",              required, unique text
              "title": "Website Redesign",
              "level": 0,                0 = top level, 1 = subpage of the page above, 2 = sub-subpage...
              "created": "2026-10-01T09:00:00.000Z",   optional ISO date
              "notes": [
                { "x": 40, "y": 20, "w": 500, "html": "<p>Note text</p>" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

- Required: `notebooks`, and for each notebook, section and page an `id` plus its `sections`, `pages` or `notes` array (can be empty).
- Everything else is optional and gets a default (names, colours, dates, note position `x`/`y`/width `w` in pixels).
- Pages are listed in display order; `level` makes a page a child of the nearest page above it with a lower level.
- Note `html` supports `<p>`, `<h1>`, `<h2>`, `<b>`, `<i>`, `<u>`, `<ul>`/`<ol>`/`<li>`, `<table>`, `<a href>`, `<img src="data:image/...">` and to-dos: `<span class="todo" contenteditable="false" data-checked="true"></span>`. Scripts and event attributes are removed.

## Shortcuts

Mac shortcuts are shown; on Windows use Ctrl in place of ⌘. Every action is also in the menu bar, and toolbar tooltips show the shortcut.

| Mac | Windows | Action |
| --- | --- | --- |
| ⌘N | Ctrl+N | New page |
| ⌥⌘N | | New subpage |
| ⇧⌘N | Ctrl+Shift+N | New section |
| ⌘O / ⇧⌘E | Ctrl+O / Ctrl+Shift+E | Import / export |
| ⌘F | Ctrl+F | Search all notebooks |
| ⌃⌘S | Ctrl+Shift+L | Show or hide the sidebar |
| ⌘+ / ⌘- / ⌘0 | Ctrl++ / Ctrl+- / Ctrl+0 | Note text bigger / smaller / actual size |
| ⌘B / ⌘I / ⌘U | Ctrl+B / I / U | Bold / italic / underline |
| ⇧⌘X | Ctrl+Shift+X | Strikethrough |
| ⌥⌘1 / ⌥⌘2 / ⌥⌘0 | Ctrl+Shift+1 / 2 / 0 | Title / heading / body |
| ⇧⌘7 / ⇧⌘8 | Ctrl+Shift+7 / 8 | Bulleted / numbered list |
| ⌘1 | Ctrl+1 | To-do checkbox |
| ⇧⌘H | Ctrl+Shift+H | Highlight |
| ⌘K | Ctrl+K | Add link |
| ⇧⌘I | Ctrl+Shift+I | Insert image |
| ↑ ↓ ← → | | Move through sections and pages; ← → collapse and expand subpages |
| ↩ | Enter | Rename the selected section or page |
| ⌘⌫ | Ctrl+Backspace | Delete the selected section or page |
| ⌘[ / ⌘] | Ctrl+[ / ] | Move a page out one level / make it a subpage |
| ⌃⌘F | F11 | Full screen |
