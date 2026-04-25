import { Order } from "./types";

// parseFloat is declared in the TypeScript standard-library ambient .d.ts —
// no body the parser can follow. Should refuse with `external-ambient`.
function apply(order: Order, raw: string): Order {
  return { ...order, total: parseFloat(raw) };
}
