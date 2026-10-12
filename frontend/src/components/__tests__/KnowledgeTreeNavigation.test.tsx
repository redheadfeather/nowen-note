import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TreePanel from "../KnowledgeTreePanel";
import { api } from "@/lib/api";
import { NoteActivationGuard } from "@/lib/noteActivationGuard";
import { NoteLoadCoordinator, type NoteLoadOptions } from "@/lib/noteLoadCoordinator";
import type { Note } from "@/types";
import type { KnowledgeTreeNode } from "@/lib/knowledgeTreeApi";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};

const mock = vi.hoisted(() => ({
  list: vi.fn(), loadNote: vi.fn(),
  actions: {
    setActiveNote: vi.fn(), setSelectedNotebook: vi.fn(), setSelectedKnowledgeTreeParent: vi.fn(),
    setViewMode: vi.fn(), openNoteTab: vi.fn(), setMobileView: vi.fn(), setMobileSidebar: vi.fn(),
  },
  state: { viewMode: "notebook", searchQuery: "", selectedNotebookId: null, activeNote: null as Note | null, notebooks: [], noteListCollapsed: false },
}));
vi.mock("@/store/AppContext", () => ({ useApp: () => ({ state: mock.state }), useAppActions: () => mock.actions }));
vi.mock("@/hooks/useNoteLoader", () => ({ useNoteLoader: () => ({ loadNote: mock.loadNote }) }));
vi.mock("@/lib/knowledgeTreeApi", () => ({ knowledgeTreeApi: { list: mock.list, listShared: async () => ({ nodes: [] }) } }));
vi.mock("@/components/KnowledgeTreeNodeMenu", () => ({ default: () => null }));
vi.mock("@/components/KnowledgeTreePermissionsDialog", () => ({ default: () => null }));
vi.mock("@/components/FolderPasswordDialog", () => ({ default: () => null }));
vi.mock("@/components/attachmentDetail/AttachmentDetailDrawer", () => ({ default: () => null }));

function note(id: string): Note {
  return { id, title: id, notebookId: "folder", workspaceId: "team", contentFormat: "tiptap-json", isTrashed: 0 } as Note;
}
function node(id: string): KnowledgeTreeNode {
  return {
    id, parentId: null, title: id, userId: "owner", workspaceId: "team", scopeKey: "team",
    nodeType: "note", resourceType: "note", resourceId: id, sortOrder: 0,
    isDeleted: 0, isExpanded: 0, childCount: 0, createdAt: "2026-01-01", updatedAt: "2026-01-01",
    access: { nodeId: id, rolePreset: "editor", source: "inherited", sourceNodeId: null,
      capabilities: { canView: true, canCreate: true, canEdit: true, canComment: true, canMove: false, canDelete: false, canDownload: true, canReshare: false, canManageMembers: false } },
  };
}

describe("knowledge tree navigation after a note link", () => {
  let root: Root;
  let host: HTMLDivElement;
  let guard: NoteActivationGuard;

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    guard = new NoteActivationGuard();
    // The body link has committed B and retired A's asynchronous editor callbacks.
    guard.begin({ requestId: 0, noteId: "B" }, "A");
    guard.allowActiveNote("B");
    guard.finish(0);
    guard.commit("B");
    mock.state.activeNote = note("B");
    mock.actions.setActiveNote.mockImplementation((value: Note) => {
      if (!guard.allowActiveNote(value.id)) return;
      mock.state.activeNote = value;
      guard.commit(value.id);
    });
    const coordinator = new NoteLoadCoordinator();
    mock.loadNote.mockImplementation((options: Omit<NoteLoadOptions<Note>, "sink">) => coordinator.run({
      ...options,
      sink: {
        begin: (payload) => guard.begin(payload, mock.state.activeNote?.id ?? null),
        show: () => {}, markSlow: () => {},
        finish: (id) => guard.finish(id), fail: (id) => guard.fail(id),
      },
    }));
    mock.list.mockResolvedValue({ nodes: [node("A"), node("B"), node("C")] });
    vi.spyOn(api, "getNote").mockImplementation(async (id) => note(id));
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const click = async (id: string) => {
    const row = host.querySelector(`[data-knowledge-tree-select-id="${id}"]`);
    expect(row).not.toBeNull();
    const button = row!.querySelector(`button[title="${id}"]`);
    expect(button).not.toBeNull();
    await act(async () => button!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  };

  it.each(["desktop", "mobile"] as const)("%s lets an intentional directory click return to the retired source", async (variant) => {
    await act(async () => root.render(<TreePanel variant={variant} />));
    await click("A");
    expect(mock.state.activeNote?.id).toBe("A");
    expect(mock.actions.openNoteTab).toHaveBeenLastCalledWith(expect.objectContaining({ id: "A" }));
    // B is now the retired source: its late save callback cannot steal the editor back.
    mock.actions.setActiveNote(note("B"));
    expect(mock.state.activeNote?.id).toBe("A");
  });

  it("keeps the latest directory click when an older fetch finishes late", async () => {
    let finishA!: (value: Note) => void;
    vi.mocked(api.getNote).mockImplementation((id) => id === "A"
      ? new Promise((resolve) => { finishA = resolve; }) : Promise.resolve(note(id)));
    await act(async () => root.render(<TreePanel />));
    await click("A");
    await click("C");
    await act(async () => finishA(note("A")));
    expect(mock.state.activeNote?.id).toBe("C");
    expect(mock.actions.openNoteTab).toHaveBeenLastCalledWith(expect.objectContaining({ id: "C" }));
  });
});
