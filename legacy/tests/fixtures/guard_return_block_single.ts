import { Account } from "./types";

function depositBlockForm(account: Account, amount: number): Account {
  // Block-wrapped return equivalent to `if (amount <= 0) return account;`
  if (amount <= 0) {
    return account;
  }
  return { ...account, balance: account.balance + amount };
}
