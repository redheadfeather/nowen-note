import type { Node } from "@tiptap/pm/model";

/** Server-normalized JSON can differ in key order and explicit default attrs. */
export function isEquivalentTiptapDocument(document: Node, content: string): boolean {
  try {
    const parsed = JSON.parse(content);
    if (parsed?.type !== "doc") return false;
    const incoming = document.type.schema.nodeFromJSON(parsed);
    incoming.check();
    return document.eq(incoming);
  } catch {
    return false;
  }
}
