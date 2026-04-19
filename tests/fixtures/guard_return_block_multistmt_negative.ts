import { Account } from "./types";

function depositBlockMultiStmt(account: Account, amount: number): Account {
  // Block with more than one statement before the return — the mutation
  // `amount = 0` is lost if we silently extract the return, so the parser
  // must bail the guard layer and fall the whole assignment to __ext_.
  if (amount <= 0) {
    amount = 0;
    return account;
  }
  return { ...account, balance: account.balance + amount };
}
