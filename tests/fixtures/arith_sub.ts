import { Account } from "./types";

function withdraw(account: Account, amount: number): Account {
  return { ...account, balance: account.balance - amount };
}
