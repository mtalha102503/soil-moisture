"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "bot";
  text: string;
}

const EXAMPLE_QUESTIONS: { label: string; question: string }[] = [
  {
    label: "Hourly value",
    question:
      "What was the soil moisture at 0-7 cm depth in Lahore on 14 May 2023 at 3 pm?",
  },
  {
    label: "Daily average",
    question: "What was the average soil moisture in Faisalabad on 10 June 2022?",
  },
  {
    label: "Daily maximum",
    question: "What was the maximum temperature in Multan on 5 August 2021?",
  },
  {
    label: "Daily minimum",
    question: "What was the minimum relative humidity in Lahore on 20 January 2024?",
  },
  {
    label: "Daily rain total",
    question: "How much rain fell in Faisalabad on 18 July 2022?",
  },
  {
    label: "Monthly average",
    question: "What was the average soil moisture in Faisalabad in June 2022?",
  },
  {
    label: "City comparison",
    question: "Which city was wetter on 14 May 2023, Lahore or Multan?",
  },
  {
    label: "Irrigation advice",
    question: "Should I irrigate in Multan on 1 January 2020?",
  },
  {
    label: "Dataset info",
    question: "How many question-answer pairs are in the dataset?",
  },
];

const WELCOME: Message = {
  role: "bot",
  text:
    "Assalam-o-Alaikum! Ask me about soil moisture, temperature, humidity or rainfall " +
    "for Faisalabad, Multan or Lahore - any hour, day or month from 2020 to 2024 (times in UTC). " +
    "Tap an example below or type your own question.",
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as { answer?: string };
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: data.answer ?? "Sorry, I could not answer that. Please try again.",
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "bot",
          text: "Sorry, the server could not be reached. Please try again.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6">
      <header className="mb-4 rounded-2xl bg-emerald-800 px-5 py-4 text-white shadow">
        <h1 className="text-xl font-semibold">Soil Moisture Chatbot</h1>
        <p className="mt-1 text-sm text-emerald-100">
          A chatbot over ERA5-Land soil moisture data for Faisalabad, Multan and
          Lahore - hourly records from 2020 to 2024, all times in UTC. Every
          answer is computed live from the stored data, never guessed.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {EXAMPLE_QUESTIONS.map((ex) => (
          <button
            key={ex.label}
            type="button"
            disabled={busy}
            onClick={() => ask(ex.question)}
            className="rounded-full border border-emerald-700 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-100 disabled:opacity-50"
            title={ex.question}
          >
            {ex.label}
          </button>
        ))}
      </div>

      <section className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-emerald-700 text-white"
                  : "bg-emerald-50 text-slate-800"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm text-slate-500">
              Looking it up in the data...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </section>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about soil moisture, e.g. Lahore on 14 May 2023 at 3 pm"
          className="flex-1 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm shadow-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-200"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50"
        >
          Ask
        </button>
      </form>

      <footer className="mt-3 text-center text-xs text-slate-500">
        Data: ERA5-Land via Open-Meteo, stored in Supabase. Coverage:
        1 January 2020 - 31 December 2024, hourly, UTC.
      </footer>
    </main>
  );
}
