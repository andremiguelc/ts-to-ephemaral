import { Order } from "./types";

const resetTotal = (order: Order): Order => ({ ...order, total: 100 });
