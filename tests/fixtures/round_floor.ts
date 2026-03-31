import { Order } from "./types";

function floorTotal(order: Order): Order {
  return { ...order, total: Math.floor(order.subtotal) };
}
