import { Account } from "./types";

function depositIfElseBoth(account: Account, amount: number): Account {
  // if/else where both branches return different values is out of scope
  // for v0.2.2 — the assignment site is inside one branch, so the extractor
  // bails the guard layer.
  if (amount > 0) {
    return { ...account, balance: account.balance + amount };
  } else {
    return { ...account, balance: account.balance };
  }
}
