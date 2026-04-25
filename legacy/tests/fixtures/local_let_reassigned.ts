import { Account } from "./types";

function processDeposit(account: Account, amount: number): Account {
  let result = account.balance;
  result = result + amount;
  return { ...account, balance: result };
}
