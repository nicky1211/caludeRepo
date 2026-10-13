# Notebook

A OneNote-style note-taking app that runs entirely in the browser. No build step or server required.

## Run

Open `index.html` in a browser, or serve the folder:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Features

- Notebooks > Sections > Pages hierarchy, with subpages
- Free-form page canvas: click anywhere to add a note container; drag its top bar to move it and its right edge to resize
- Rich text: bold, italic, underline, strikethrough, headings, lists, to-do checkboxes, highlight, font color, links, tables, images (insert or paste)
- Drag and drop to reorder sections and pages; drop a page on a section to move it (subpages move with their parent)
- Right-click menus: rename, section color, make/promote subpage, duplicate, move, delete
- Search across all notebooks (Ctrl+E)
- Auto-save to browser localStorage; Export/Import as JSON for backup or moving between browsers

## Shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+E | Search |
| Ctrl+1 | Toggle to-do checkbox on the current line |
| Ctrl+B / I / U | Bold / italic / underline |
| Tab / Shift+Tab | Indent / outdent |
| Ctrl+click link | Open link |

Data is stored per browser. Use Export regularly to keep a backup.
