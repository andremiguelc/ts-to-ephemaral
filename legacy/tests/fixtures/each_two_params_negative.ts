import { Order } from "./types";

function twoParamCallback(order: Order): Order {
  // Two-param callback (item, index) — must fall back, not extract as `each`.
  return {
    ...order,
    total: order.lineItems.every((item, index) => item.quantity > index)
      ? order.subtotal
      : 0,
  };
}
