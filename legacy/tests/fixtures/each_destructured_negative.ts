import { Order } from "./types";

function destructuredCallback(order: Order): Order {
  // Destructured callback parameter — must fall back, not extract as `each`.
  return {
    ...order,
    total: order.lineItems.every(({ quantity }) => quantity > 0)
      ? order.subtotal
      : 0,
  };
}
