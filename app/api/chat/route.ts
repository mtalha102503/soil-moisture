import { NextResponse } from "next/server";
import { parseQuestion } from "@/lib/parser";
import { answerQuestion, HELP_ANSWER } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatRequestBody {
  question?: unknown;
}

export async function POST(req: Request) {
  let body: ChatRequestBody;
  try {
    body = (await req.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json(
      { answer: "Please send a JSON body with a question field." },
      { status: 400 }
    );
  }

  const question =
    typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ answer: HELP_ANSWER });
  }

  const parsed = parseQuestion(question);
  try {
    const answer = await answerQuestion(parsed);
    return NextResponse.json({ answer, parsed });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unexpected server error.";
    // Configuration problems (missing env vars) are reported plainly so the
    // person deploying the app knows what to fix; nothing secret is exposed.
    const isConfig = message.includes("not configured");
    return NextResponse.json(
      {
        answer: isConfig
          ? "The chatbot is not connected to its database yet. Set SUPABASE_URL and SUPABASE_SECRET_KEY in the environment and try again."
          : "Sorry, something went wrong while looking that up. Please try again.",
        error: message,
      },
      { status: isConfig ? 503 : 500 }
    );
  }
}
