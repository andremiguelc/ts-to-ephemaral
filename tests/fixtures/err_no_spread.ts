import { Order } from "./types";

function resetTotal(order: Order): Order {
  return { total: 100 };
}
