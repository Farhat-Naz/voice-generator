import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TURNS = 20;
const MAX_CHARS = 1000;

const SYSTEM =
  "You are a friendly voice assistant. Your replies are spoken aloud, so keep them short " +
  "(1-3 sentences), conversational, and free of markdown, lists, or emoji. " +
  'You began the conversation by asking the user "Hello, how are you?".';

type Msg = { role: "user" | "assistant"; content: string };

function sha(s: string) {
  return createHash("sha256").update(s).digest();
}

function codeMatches(given: string, expected: string) {
  return timingSafeEqual(sha(given), sha(expected));
}

export async function POST(req: Request) {
  const expected = process.env.ACCESS_CODE;
  if (!expected) {
    // Fail closed: never expose a public endpoint that spends API credits.
    if (process.env.NODE_ENV === "production") {
      return Response.json({ error: "Server is missing ACCESS_CODE." }, { status: 500 });
    }
  } else if (!codeMatches(req.headers.get("x-access-code") ?? "", expected)) {
    return Response.json({ error: "Wrong access code." }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "Server is missing ANTHROPIC_API_KEY." }, { status: 500 });
  }

  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: Msg[] = raw
    .filter(
      (m): m is Msg =>
        !!m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim().length > 0,
    )
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  // The API requires the conversation to start with a user turn and end with one.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return Response.json({ error: "No user message." }, { status: 400 });
  }

  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: SYSTEM,
      messages,
    });
    const block = resp.content.find((b) => b.type === "text");
    return Response.json({ reply: block && block.type === "text" ? block.text : "" });
  } catch (e) {
    console.error("Claude error:", e);
    return Response.json({ error: "Claude request failed." }, { status: 502 });
  }
}
