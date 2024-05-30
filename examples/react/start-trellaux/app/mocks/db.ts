import { delay, http, HttpResponse } from "msw";
import { z } from "zod";

export const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string().optional(),
  order: z.coerce.number(),
  columnId: z.string().uuid(),
  boardId: z.coerce.number(),
});

export const columnSchema = z.object({
  id: z.string().uuid(),
  boardId: z.coerce.number(),
  name: z.string(),
  order: z.number(),
});

export const boardSchema = z.object({
  id: z.coerce.number(),
  name: z.string(),
  color: z.string(),
  columns: z.array(columnSchema),
  items: z.array(itemSchema),
});

let extraDelay = 0;
export function setExtraDelay(delay: number) {
  extraDelay = delay;
}

export const updateSchema = z.union([
  z
    .object({ intent: z.literal("updateBoardName") })
    .merge(boardSchema.pick({ id: true, name: true })),
  z
    .object({ intent: z.literal("updateColumn") })
    .merge(columnSchema.pick({ id: true, name: true })),
]);

export const deleteItemSchema = itemSchema.pick({ id: true, boardId: true });
export const newColumnSchema = columnSchema.omit({ order: true });

export type Board = z.infer<typeof boardSchema>;
export type Column = z.infer<typeof columnSchema>;
export type Item = z.infer<typeof itemSchema>;

const board: Board = {
  id: 1,
  name: "First board",
  color: "#e0e0e0",
  columns: [],
  items: [],
};

const upsertItem = (item: Item) => {
  const existingItem = board.items.find((i) => i.id === item.id);
  if (existingItem) {
    Object.assign(existingItem, item);
  } else {
    board.items.push(item);
  }
};

export const handlers = [
  http.post("/board/newColumn", async ({ request }) => {
    const newColumn = newColumnSchema.parse(await request.json());
    board.columns = [
      ...board.columns,
      { ...newColumn, order: board.columns.length + 1 },
    ];

    await delay();
    await delay(extraDelay);

    return HttpResponse.json({ ok: true });
  }),
  http.post("/board/newItem", async ({ request }) => {
    const newItem = itemSchema.parse(await request.json());
    upsertItem(newItem);

    await delay();
    await delay(extraDelay);

    return HttpResponse.json({ ok: true });
  }),
  http.post("/board/deleteItem", async ({ request }) => {
    const { id } = deleteItemSchema.parse(await request.json());

    board.items = board.items.filter((item) => item.id !== id);
    await delay();
    await delay(extraDelay);

    return HttpResponse.json({ ok: true });
  }),
  http.post("/board/moveItem", async ({ request }) => {
    const item = itemSchema.parse(await request.json());

    upsertItem(item);
    await delay();
    await delay(extraDelay);

    return HttpResponse.json({ ok: true });
  }),
  http.post("/board/update", async ({ request }) => {
    const payload = updateSchema.parse(await request.json());
    if (payload.intent === "updateBoardName") {
      board.name = payload.name;
    } else if (payload.intent === "updateColumn") {
      const column = board.columns.find((c) => c.id === payload.id);
      if (column) {
        column.name = payload.name;
      }
    }

    await delay();
    await delay(extraDelay);

    return HttpResponse.json({ ok: true });
  }),
  http.get("/board/*", async () => {
    await delay();
    await delay(extraDelay);
    return HttpResponse.json(board);
  }),
];
