import { Order } from "./types";

// `order.subtotal` is non-nullable (`subtotal: number` on the type), so `?? 0`
// is a runtime no-op. The parser should emit the bare field, not an isPresent.
function applyFlatFee(order: Order): Order {
  return { ...order, total: (order.subtotal ?? 0) + 10 };
}
