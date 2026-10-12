import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

/** setEditable stops DOM input, but ProseMirror commands can still change the document. */
export const RichTextReadOnlyGuard = Extension.create<{
  isApplyingContent: () => boolean;
}>({
  name: "richTextReadOnlyGuard",
  addOptions: () => ({ isApplyingContent: () => false }),
  addProseMirrorPlugins() {
    return [new Plugin({
      filterTransaction: (transaction) => !transaction.docChanged
        || this.editor.isEditable
        || this.options.isApplyingContent(),
    })];
  },
});
