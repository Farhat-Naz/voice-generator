# Voice Agent

A Windows voice assistant that greets you at login ("Hello, how are you?"), then holds a
spoken conversation using Claude.

Pipeline: microphone -> speech recognition -> Claude -> neural text-to-speech.

## Setup

```powershell
pip install -r requirements.txt
copy .env.example .env      # then paste your ANTHROPIC_API_KEY into .env
python agent.py             # try it
powershell -ExecutionPolicy Bypass -File install.ps1   # run automatically at login
```

Say "goodbye" to end a session. To remove the login shortcut, delete `VoiceGreeting.lnk`
from `shell:startup`.

Never commit `.env` - it holds your API key (it is git-ignored).
