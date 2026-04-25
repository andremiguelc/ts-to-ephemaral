import { Account } from "./types";

function clampToZero(account: Account, fee: number): Account {
  return {
    ...account,
    balance: account.balance - fee >= 0 ? account.balance - fee : 0,
  };
}
