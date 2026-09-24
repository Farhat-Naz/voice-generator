"""Voice agent: greets you, then holds a spoken conversation using Claude.

Loop: listen (mic) -> transcribe -> Claude -> speak.
Say "goodbye" / "stop" / "exit" to end the session.
"""
import asyncio
import ctypes
import io
import os
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np
import sounddevice as sd
import speech_recognition as sr

HERE = Path(__file__).parent
MODEL = "claude-haiku-4-5-20251001"   # fast, good for voice
VOICE = "en-US-AriaNeural"
SAMPLE_RATE = 16000
SILENCE_SECONDS = 1.2     # stop recording after this much quiet
MAX_SECONDS = 20
NO_SPEECH_TIMEOUT = 15    # give up waiting for you to start talking
EXIT_WORDS = {"goodbye", "bye", "stop", "exit", "quit", "that's all"}

SYSTEM = (
    "You are a friendly voice assistant running on the user's PC. Your replies are spoken "
    "aloud, so keep them short (1-3 sentences), conversational, and free of markdown, "
    "lists, or emoji."
)


def load_env():
    env = HERE / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


# ---------- speaking ----------
def _play_mp3(path: str):
    mci = ctypes.windll.winmm.mciSendStringW
    mci(f'open "{path}" type mpegvideo alias reply', None, 0, 0)
    mci("play reply wait", None, 0, 0)
    mci("close reply", None, 0, 0)


def _speak_sapi(text: str):
    import pyttsx3
    engine = pyttsx3.init()
    engine.say(text)
    engine.runAndWait()


def speak(text: str):
    print(f"Agent: {text}")
    try:
        import edge_tts
        fd, path = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)
        asyncio.run(edge_tts.Communicate(text, VOICE).save(path))
        _play_mp3(path)
        os.remove(path)
    except Exception as e:  # offline or edge-tts failure -> built-in voice
        print(f"(neural voice unavailable: {e}; using Windows voice)")
        _speak_sapi(text)


# ---------- listening ----------
def listen() -> str | None:
    """Record until you stop talking, return transcribed text (or None)."""
    block = int(SAMPLE_RATE * 0.1)
    chunks, started, quiet = [], False, 0.0
    threshold = None
    t0 = time.time()
    with sd.InputStream(samplerate=SAMPLE_RATE, channels=1, dtype="int16", blocksize=block) as stream:
        # calibrate background noise for 0.5s
        noise = [np.abs(stream.read(block)[0]).mean() for _ in range(5)]
        threshold = max(300, np.mean(noise) * 3)
        while True:
            data, _ = stream.read(block)
            level = np.abs(data).mean()
            elapsed = time.time() - t0
            if level > threshold:
                started, quiet = True, 0.0
            elif started:
                quiet += 0.1
            if started:
                chunks.append(data.copy())
                if quiet >= SILENCE_SECONDS or elapsed > MAX_SECONDS:
                    break
            elif elapsed > NO_SPEECH_TIMEOUT:
                return None

    audio = np.concatenate(chunks).tobytes()
    recognizer = sr.Recognizer()
    try:
        return recognizer.recognize_google(sr.AudioData(audio, SAMPLE_RATE, 2))
    except sr.UnknownValueError:
        return ""
    except sr.RequestError as e:
        print(f"(speech recognition error: {e})")
        return ""


# ---------- main ----------
def main():
    load_env()
    if "--startup" in sys.argv:
        time.sleep(10)   # let audio devices and network come up after login
    speak("Hello, how are you?")

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("No ANTHROPIC_API_KEY found (put it in D:\\agent\\.env). Greeting only.")
        return

    import anthropic
    client = anthropic.Anthropic()
    history = []
    idle = 0

    while True:
        print("Listening...")
        heard = listen()
        if heard is None:               # long silence
            break
        if not heard:
            idle += 1
            if idle >= 2:
                speak("I didn't catch that. I'll be here if you need me.")
                break
            speak("Sorry, I didn't catch that.")
            continue
        idle = 0
        print(f"You: {heard}")
        if heard.lower().strip(" .!") in EXIT_WORDS:
            speak("Goodbye! Have a great day.")
            break

        history.append({"role": "user", "content": heard})
        try:
            resp = client.messages.create(
                model=MODEL, max_tokens=300, system=SYSTEM, messages=history
            )
            reply = resp.content[0].text
        except Exception as e:
            print(f"(Claude error: {e})")
            speak("Sorry, I'm having trouble thinking right now.")
            history.pop()
            continue
        history.append({"role": "assistant", "content": reply})
        speak(reply)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(0)
