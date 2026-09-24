# Speaks a greeting using the built-in Windows voice.
Start-Sleep -Seconds 10   # wait for audio device / desktop to be ready after login

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 100
$synth.Speak("Hello, how are you?")
$synth.Dispose()
