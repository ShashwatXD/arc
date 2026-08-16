export async function readSse(
  response: Response,
  onEvent: (event: string, data: unknown) => void,
) {
  if (!response.body) throw new Error("No response body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const event = /event: (\w+)/.exec(part)?.[1];
      const raw = part.split("data: ")[1];
      if (!event || !raw) continue;
      onEvent(event, JSON.parse(raw));
    }
  }
}
