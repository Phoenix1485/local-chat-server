const encoder = new TextEncoder();

export function createSseResponse(
  request: Request,
  start: (send: (event: string, payload: unknown) => void, close: () => void) => () => void
): Response {
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const close = () => {
        if (closed) {
          return;
        }
        closed = true;
        cleanup?.();
        controller.close();
      };

      const send = (event: string, payload: unknown) => {
        if (closed) {
          return;
        }
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      cleanup = start(send, close);

      request.signal.addEventListener('abort', () => {
        close();
      });
    },
    cancel() {
      cleanup?.();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
