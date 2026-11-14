import { isAllowedWallet, LOCAL_PAPER_ADDRESS } from "@/lib/auth/allowlist";
import { readOwnerAddress } from "./owner";
import { isLocalWeb } from "./paths";

const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Who may hold a session. Outside local web this is the server allowlist.
 * On this PC, the paper button and the first Phantom wallet are allowed; a second wallet is not.
 */
export function sessionWalletAllowed(address: string): boolean {
  if (!isLocalWeb()) return isAllowedWallet(address);
  if (address === LOCAL_PAPER_ADDRESS) return true;
  const owner = readOwnerAddress();
  if (!owner) return B58.test(address);
  return address === owner;
}
