// @vitest-environment jsdom
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { RichTextReadOnlyGuard } from "../richTextReadOnlyGuard";

describe("rich text read-only transactions", () => {
  let editor: Editor;
  let applyingContent = false;
  const createEditor = (editable = false) => {
    applyingContent = false;
    editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit, RichTextReadOnlyGuard.configure({ isApplyingContent: () => applyingContent })],
      content: "<p>Test text</p>",
      editable,
    });
    editor.commands.setTextSelection({ from: 1, to: 10 });
    return editor;
  };
  afterEach(() => editor?.destroy());

  it.each(["bold", "heading", "list", "insert"])("rejects a %s command while locked", (command) => {
    createEditor();
    const before = editor.getJSON();
    if (command === "bold") editor.commands.toggleBold();
    if (command === "heading") editor.commands.toggleHeading({ level: 1 });
    if (command === "list") editor.commands.toggleBulletList();
    if (command === "insert") editor.commands.insertContent("Late upload or AI result");
    expect(editor.getJSON()).toEqual(before);
  });
  it("rejects undo while locked and resumes editing after unlock", () => {
    createEditor(true);
    editor.commands.toggleBold();
    const beforeLock = editor.getJSON();
    editor.setEditable(false);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(beforeLock);
    editor.setEditable(true);
    editor.commands.undo();
    expect(editor.getHTML()).toBe("<p>Test text</p>");
  });
  it("permits selecting text and trusted content refreshes without opening a later edit window", () => {
    createEditor();
    editor.commands.setTextSelection(2);
    expect(editor.state.selection.from).toBe(2);
    applyingContent = true;
    try { editor.commands.setContent("<p>Remote refresh</p>", { emitUpdate: false }); }
    finally { applyingContent = false; }
    expect(editor.getHTML()).toBe("<p>Remote refresh</p>");
    editor.commands.insertContent("blocked");
    expect(editor.getHTML()).toBe("<p>Remote refresh</p>");
  });
});
