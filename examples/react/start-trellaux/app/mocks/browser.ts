import { setupWorker } from "msw/browser";
import { handlers } from "./db.js";

export const worker = setupWorker(...handlers);
