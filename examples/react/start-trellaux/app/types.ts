export interface RenderedItem {
  id: string;
  title: string;
  order: number;
  content?: string;
  columnId: string;
}

export const CONTENT_TYPES = {
  card: "application/remix-card",
  column: "application/remix-column",
};

export const INTENTS = {
  updateColumn: "updateColumn" as const,
  updateBoardName: "updateBoardName" as const,
};

export const ItemMutationFields = {
  id: { type: String, name: "id" },
  columnId: { type: String, name: "columnId" },
  order: { type: Number, name: "order" },
  title: { type: String, name: "title" },
} as const;
