"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type Status = "idle" | "listening" | "thinking" | "speaking";

const GREETING = "Hello, how are you?";
const EXIT_WORDS = ["goodbye", "bye", "stop", "exit", "quit", "that's all"];
const MAX_MISSES = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;

function speak(text: string): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.onend = () => resolve();
    u.onerror = () => resolve();
    synth.speak(u);
  });
}

export default function Home() {
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const activeRef = useRef(false);
  const historyRef = useRef<Msg[]>([]);
  const recRef = useRef<AnyRec>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as AnyRec;
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition) && !!w.speechSynthesis);
    // A link like /?code=XXXX saves the code on this device, then hides it from the URL.
    const fromUrl = new URLSearchParams(window.location.search).get("code");
    if (fromUrl) {
      setCode(fromUrl);
      try {
        localStorage.setItem("access-code", fromUrl);
      } catch {}
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      try {
        setCode(localStorage.getItem("access-code") ?? "");
      } catch {}
    }
    return () => {
      activeRef.current = false;
      recRef.current?.abort();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function add(msg: Msg) {
    historyRef.current = [...historyRef.current, msg];
    setMessages(historyRef.current);
  }

  // Resolves with the transcript, or "" if nothing was heard. Rejects on mic errors.
  function listen(): Promise<string> {
    return new Promise((resolve, reject) => {
      const w = window as AnyRec;
      const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
      const rec = new Rec();
      recRef.current = rec;
      rec.lang = "en-US";
      rec.interimResults = false;
      rec.continuous = false;
      let text = "";
      rec.onresult = (e: AnyRec) => {
        text = e.results[0][0].transcript;
      };
      rec.onerror = (e: AnyRec) => {
        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
          reject(new Error("Microphone access was blocked. Allow it in your browser and try again."));
        } else if (e.error === "audio-capture") {
          reject(new Error("No microphone found."));
        }
      };
      rec.onend = () => resolve(text.trim());
      try {
        rec.start();
      } catch (err) {
        reject(err);
      }
    });
  }

  async function ask(): Promise<string> {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": code },
      body: JSON.stringify({ messages: historyRef.current }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
    return data.reply as string;
  }

  async function start() {
    setError("");
    try {
      localStorage.setItem("access-code", code);
    } catch {}
    activeRef.current = true;
    setActive(true);
    historyRef.current = [];
    setMessages([]);

    try {
      setStatus("speaking");
      add({ role: "assistant", content: GREETING });
      await speak(GREETING);

      let misses = 0;
      while (activeRef.current) {
        setStatus("listening");
        const heard = await listen();
        if (!activeRef.current) break;

        if (!heard) {
          if (++misses >= MAX_MISSES) break;
          continue;
        }
        misses = 0;

        if (EXIT_WORDS.includes(heard.toLowerCase().replace(/[.!?\s]+$/g, ""))) {
          add({ role: "user", content: heard });
          add({ role: "assistant", content: "Goodbye! Have a great day." });
          setStatus("speaking");
          await speak("Goodbye! Have a great day.");
          break;
        }

        add({ role: "user", content: heard });
        setStatus("thinking");
        const reply = await ask();
        if (!activeRef.current) break;
        add({ role: "assistant", content: reply });
        setStatus("speaking");
        await speak(reply);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      stop();
    }
  }

  function stop() {
    activeRef.current = false;
    recRef.current?.abort();
    window.speechSynthesis?.cancel();
    setActive(false);
    setStatus("idle");
  }

  const label: Record<Status, string> = {
    idle: "Tap to start",
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking…",
  };

  return (
    <main className="wrap">
      <h1>Voice Agent</h1>
      <p className="sub">Talk to Claude. Say “goodbye” to end.</p>

      {!supported && (
        <p className="error">
          Your browser doesn’t support voice input. Please use Chrome or Edge.
        </p>
      )}

      <label className="code">
        <span>Access code</span>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={active}
          autoComplete="off"
          placeholder="Enter access code"
        />
      </label>

      <button
        className={`mic ${status}`}
        onClick={active ? stop : start}
        disabled={!supported}
        aria-label={active ? "Stop conversation" : "Start conversation"}
      >
        {active ? "■" : "🎤"}
      </button>
      <p className="status" aria-live="polite">
        {label[status]}
      </p>

      {error && <p className="error">{error}</p>}

      <section className="chat" aria-label="Conversation">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        <div ref={endRef} />
      </section>
    </main>
  );
}
