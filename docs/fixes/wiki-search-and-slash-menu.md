# Workspace note-link search and rich-text slash menu

Based on v1.5.1 plus the previous locked-editor/navigation fixes (`c81e04a`).

## Note-link search

Typing `[[10月` in a collaborative workspace returned no existing inspection
notes because `api.searchNotes` omitted `workspaceId`. The search endpoint
correctly searched the personal scope by default. Include the selected workspace
in reference-search requests, retaining the existing personal-scope behavior and
server-side access checks.

## Slash menu

The editor is created after mount (`immediatelyRender: false`), but content sync
did not depend on the editor instance. Its initial null-editor run never recorded
the loaded note ID. The first autosave was then mistaken for a note switch and
replaced the document, closing the menu. Run content sync when the editor becomes
ready so the first acknowledgement belongs to the already loaded note.

On desktop, the drag-handle component registers its ProseMirror plugin again as
its options change on a React render. ProseMirror recreates all plugin views while
retaining plugin state. The slash plugin incorrectly treated its view cleanup as
session termination. Close on actual editor destruction or plugin removal, not
ordinary plugin-view recreation. The regression fails on the original code.

The menu could also close when automatic save fed server-normalized JSON back to the editor.
String equality treated reordered JSON keys or explicit default attributes as a
different document. The resulting whole-document replacement reset the active
slash session. Compare valid incoming JSON with the current ProseMirror document
using the editor's schema and `Node.eq`. Equivalent acknowledgements retain the
selection and menu; actual text/attribute changes and note switches still sync.

## Verification

- The workspace request regression failed before the fix and passed afterward.
- 35 targeted tests passed across workspace requests, document equality, slash
  commands, save acknowledgements, locked editors, and knowledge-tree navigation.
- TypeScript and the production web build passed.
- Newly added helper/test files passed ESLint. The existing workspace test file
  retains two pre-existing unused-parameter diagnostics.
- Verified on the deployed VM in narrow and desktop layouts: the slash menu
  remains open after autosave and can execute a heading command; `[[10月` finds
  the workspace inspection notes and inserts a whole-note reference.
- The deployment preserves note titles/content and includes a stopped-service
  backup of the persistent data directory.

LM Studio endpoint configuration and synthetic knowledge-base test notes are
deployment data. They are not included in this source change or its Git history.
