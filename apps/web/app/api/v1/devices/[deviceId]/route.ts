import { ok, readJson } from "@/lib/bff";
import { guarded } from "@/lib/bff-wrap";
import { registerDevice, revokeDevice } from "@/lib/mock/account";

/** PUT /devices/{device_id} `DeviceRegistration` — register or rotate (mock; nothing is sent to a push service). */
export async function PUT(req: Request, ctx: RouteContext<"/api/v1/devices/[deviceId]">) {
  const { deviceId } = await ctx.params;
  const parsed = await readJson(req);
  if (parsed instanceof Response) return parsed;
  return guarded(() => ok(registerDevice(deviceId, parsed.body)));
}

/** DELETE /devices/{device_id} — sign out this device. */
export async function DELETE(_req: Request, ctx: RouteContext<"/api/v1/devices/[deviceId]">) {
  const { deviceId } = await ctx.params;
  return guarded(() => ok(revokeDevice(deviceId)));
}
