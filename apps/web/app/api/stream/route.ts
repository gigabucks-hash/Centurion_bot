/** Mock realtime feed via Server-Sent Events, scoped to one workspace mode. */
import { connection } from "next/server";
import { createEventGenerator } from "@/lib/mock/stream";

export async function GET(request: Request) {
  await connection();
  const mode = new URL(request.url).searchParams.get("mode") === "real" ? "real" : "practice";
  const next = createEventGenerator(mode);
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("hello", { ok: true, source: "mock", mode });
      const tick = () => {
        try {
          send("trade", next());
        } catch {
          return;
        }
        timer = setTimeout(tick, (mode === "real" ? 3000 : 1200) + Math.random() * 1800);
      };
      timer = setTimeout(tick, 400);
      request.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      clearTimeout(timer);
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive" } });
}
