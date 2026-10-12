// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/types";
import type { NoteEditorHandle } from "@/components/editors/types";
import { toggleWrap, insertImage } from "@/lib/markdownCommands";

const mocks = vi.hoisted(() => ({
  upload: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn(), pickerClick: vi.fn(),
  preview: vi.fn(), update: vi.fn(),
  t: (key: string) => key,
  i18n: { language: "zh-CN", on: () => {}, off: () => {} },
}));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: mocks.t, i18n: mocks.i18n }) }));
vi.mock("@/lib/api", () => ({ api: { attachments: { upload: mocks.upload } }, getServerUrl: () => "", getCurrentWorkspace: () => null }));
vi.mock("@/lib/toast", () => ({ toast: { error: mocks.error, info: mocks.info, success: mocks.success } }));
vi.mock("@/hooks/useUserPreferences", () => ({ useUserPreferences: () => ({ prefs: { markdownDefaultViewMode: "split", remoteImagePasteMode: "keep-remote" } }) }));
vi.mock("@/hooks/useKeyboardVisible", () => ({ useKeyboardVisible: () => ({ visible: false }) }));
vi.mock("@/components/MarkdownPreview", () => ({ MarkdownPreview: (props: unknown) => { mocks.preview(props); return null; } }));
vi.mock("@/components/AttachmentLibraryPicker", () => ({ default: () => null }));
vi.mock("@/components/NoteLinkExtension", () => ({ NoteLinkMenu: () => null }));
import MarkdownEditor from "../MarkdownEditorImpl";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const note = {
  id: "readonly-note", userId: "owner", notebookId: "book", workspaceId: null,
  title: "Isolated lock check", content: "text\n\n- [ ] task", contentText: "text task", contentFormat: "markdown",
  isPinned: 0, isFavorite: 0, isLocked: 0, isArchived: 0, isTrashed: 0,
  trashedAt: null, version: 1, sortOrder: 0, createdAt: "", updatedAt: "",
} as Note;

describe("Markdown editor read-only transitions", () => {
  let host: HTMLDivElement;
  let root: Root;
  const ref = React.createRef<NoteEditorHandle>();
  const view = () => EditorView.findFromDOM(host.querySelector<HTMLElement>(".cm-editor")!)!;
  const render = async (editable: boolean, props: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) => {
    await act(async () => root.render(<MarkdownEditor ref={ref} note={{ ...note, isLocked: editable ? 0 : 1 }} editable={editable} onUpdate={mocks.update} isGuest {...props} />));
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    Object.defineProperties(Range.prototype, {
      getClientRects: { configurable: true, value: () => [] },
      getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
    });
    vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(mocks.pickerClick);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  });

  it("hides formatting buttons after locking an already mounted editor", async () => {
    await render(true);
    expect(host.querySelector('button[title="tiptap.bold"]')).not.toBeNull();
    await render(false);
    expect(host.querySelector('button[title="tiptap.bold"]')).toBeNull();
    expect(view().state.facet(EditorView.editable)).toBe(false);
    expect(view().contentDOM.getAttribute("contenteditable")).toBe("false");
  });
  it("removes preview mutation callbacks when locked", async () => {
    await render(true);
    await render(false);
    const preview = mocks.preview.mock.calls.at(-1)![0];
    expect(preview.onTaskCheckboxChange).toBeUndefined();
    expect(preview.onFormatCodeBlock).toBeUndefined();
    expect(preview.onEditEncryptedBlock).toBeUndefined();
    expect(preview.onInsertVoiceTranscript).toBeUndefined();
  });
  it("should also configure command-level read-only state", async () => {
    await render(false);
    expect(view().state.facet(EditorState.readOnly)).toBe(true);
  });
  it("should ignore deletion key events after locking", async () => {
    await render(true);
    await act(async () => view().dispatch({ selection: { anchor: 4 } }));
    await render(false);
    await act(async () => view().contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", code: "Backspace", bubbles: true, cancelable: true })));
    expect(view().state.doc.toString()).toBe(note.content);
  });
  it("should not insert a photo if it finishes uploading after locking", async () => {
    let finish!: (value: unknown) => void;
    mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render(true);
    await act(async () => host.querySelector<HTMLButtonElement>('button[title="tiptap.insertImage"]')!.click());
    const picker = mocks.pickerClick.mock.instances.at(-1) as HTMLInputElement;
    Object.defineProperty(picker, "files", { configurable: true, value: [new File(["image"], "isolated.png", { type: "image/png" })] });
    await act(async () => picker.dispatchEvent(new Event("change")));
    await render(false);
    await act(async () => finish({ category: "image", url: "/api/attachments/isolated.png", filename: "isolated.png" }));
    expect(view().state.doc.toString()).toBe(note.content);
  });
  it("rejects custom commands and imperative insertion while locked, then resumes after unlock", async () => {
    await render(false);
    expect(toggleWrap(view(), "**")).toBe(false);
    expect(insertImage(view(), "/isolated.png")).toBe(false);
    expect(ref.current!.insertMarkdownAtCursor!("blocked")).toBe(false);
    expect(ref.current!.appendMarkdown!("blocked")).toBe(false);
    expect(view().state.doc.toString()).toBe(note.content);
    await render(true);
    expect(view().state.facet(EditorState.readOnly)).toBe(false);
    await act(async () => { expect(toggleWrap(view(), "**")).toBe(true); });
    expect(view().state.doc.toString()).toContain("****");
  });
  it("does not revive a pending photo upload after locking and unlocking", async () => {
    let finish!: (value: unknown) => void;
    mocks.upload.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render(true);
    await act(async () => host.querySelector<HTMLButtonElement>('button[title="tiptap.insertImage"]')!.click());
    const picker = mocks.pickerClick.mock.instances.at(-1) as HTMLInputElement;
    Object.defineProperty(picker, "files", { configurable: true, value: [new File(["image"], "isolated.png", { type: "image/png" })] });
    await act(async () => picker.dispatchEvent(new Event("change")));
    await render(false);
    await render(true);
    await act(async () => finish({ category: "image", url: "/api/attachments/isolated.png", filename: "isolated.png" }));
    expect(view().state.doc.toString()).toBe(note.content);
  });
  it("ignores stale preview callbacks and file-paste handlers after locking", async () => {
    await render(true);
    const editablePreview = mocks.preview.mock.calls.at(-1)![0];
    await render(false);
    await act(async () => editablePreview.onTaskCheckboxChange(0, true));
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", { value: { items: [{ type: "image/png", getAsFile: () => new File(["image"], "isolated.png", { type: "image/png" }) }], getData: () => "" } });
    await act(async () => view().contentDOM.dispatchEvent(paste));
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(view().state.doc.toString()).toBe(note.content);
  });
  it("refreshes locked note content without treating the refresh as a local save", async () => {
    await render(false);
    await render(false, { note: { ...note, content: "Refreshed text", contentText: "Refreshed text", version: 2 } });
    expect(view().state.doc.toString()).toBe("Refreshed text");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("keeps collaborative text and preview refreshing in read-only mode", async () => {
    const doc = new Y.Doc();
    doc.getText("content").insert(0, note.content);
    const awareness = new Awareness(doc);
    try {
      await render(false, { yDoc: doc, awareness });
      await act(async () => { doc.transact(() => doc.getText("content").insert(0, "Remote "), "remote-fixture"); });
      expect(view().state.doc.toString()).toBe("Remote " + note.content);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 250)); });
      expect(mocks.preview.mock.calls.at(-1)![0].markdown).toBe("Remote " + note.content);
      expect(mocks.update).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      root = createRoot(host);
      awareness.destroy(); doc.destroy();
    }
  });
});

