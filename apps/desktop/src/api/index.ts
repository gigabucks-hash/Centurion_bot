import type { CoreApi } from "./contract";
import { tauriAdapter } from "./tauriAdapter";
import { browserMockAdapter } from "./browserMock";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const core: CoreApi = inTauri ? tauriAdapter : browserMockAdapter;
export const runtime = inTauri ? "tauri" : "browser-mock";
export * from "./contract";
