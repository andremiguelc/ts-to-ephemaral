import { Order } from "./types";

function markIfAllMatchSku(order: Order): Order {
  return {
    ...order,
    total: order.lineItems.every((item) => item.productId === "sku-a")
      ? order.subtotal
      : 0,
  };
}
