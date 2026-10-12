// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { Editor, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { isEquivalentTiptapDocument } from "../tiptapDocumentEquality";
import { createSlashExtension, getSlashPluginState } from "@/components/extensions/SlashCommandExtension";

describe("Tiptap document acknowledgement equality", () => {
  it("preserves an active slash across an equivalent normalized save acknowledgement", () => {
    const close = vi.fn();
    const attrs = Extension.create({
      name: "testDefaults",
      addGlobalAttributes: () => [{ types: ["paragraph"], attributes: { indent: { default: 0 } } }],
    });
    const editor = new Editor({ extensions: [StarterKit, attrs, createSlashExtension(vi.fn(), close, vi.fn())], content: "<p></p>" });
    try {
      editor.commands.insertContent("/");
      const acknowledgement = JSON.stringify({ content: [{ content: [{ text: "/", type: "text" }], type: "paragraph" }], type: "doc" });
      expect(acknowledgement).not.toBe(JSON.stringify(editor.getJSON()));
      expect(isEquivalentTiptapDocument(editor.state.doc, acknowledgement)).toBe(true);
      if (!isEquivalentTiptapDocument(editor.state.doc, acknowledgement)) editor.commands.setContent(JSON.parse(acknowledgement));
      expect(getSlashPluginState(editor).active).toBe(true);
      expect(close).not.toHaveBeenCalled();
      expect(isEquivalentTiptapDocument(editor.state.doc, JSON.stringify({ type: "doc", content: [{ type: "paragraph", attrs: { indent: 1 }, content: [{ type: "text", text: "/" }] }] }))).toBe(false);
      expect(isEquivalentTiptapDocument(editor.state.doc, JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "remote" }] }] }))).toBe(false);
      expect(isEquivalentTiptapDocument(editor.state.doc, "not json")).toBe(false);
    } finally { editor.destroy(); }
  });
});
