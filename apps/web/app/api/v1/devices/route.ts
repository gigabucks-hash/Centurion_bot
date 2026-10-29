import { list } from "@/lib/bff";
import { listDevices } from "@/lib/mock/account";

/** GET /devices — own devices without the token. */
export async function GET() {
  return list(listDevices());
}
