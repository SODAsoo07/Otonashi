# Otonashi OpenUtau Adapter Prototype

This is a standalone `net8.0` prototype for the OpenUTAU fork side of the Otonashi vowel-only renderer integration.

It intentionally does not reference `OpenUtau.Core.dll` yet. The current goal is only to prove the client path that the fork will need:

- health check
- note request JSON submission
- WAV response validation
- output WAV save
- clear fallback signal when the service is unavailable

## Run

Start the Otonashi service:

```powershell
npm run otonashi:service -- --host 127.0.0.1 --port 38240
```

In another shell:

```powershell
dotnet run --project prototypes/openutau-adapter -- --base-url http://127.0.0.1:38240 --input examples\vowel-note.json --output out\openutau-adapter-vowel.wav
```

Expected result:

- `out/openutau-adapter-vowel.wav` exists
- console JSON prints `ok: true`
- service diagnostics include frame count, duration, peak, and RMS

## Fallback Behavior

If the service is down or returns an invalid payload, this prototype exits with code `2` and prints:

```json
{
  "ok": false,
  "fallbackRecommended": true
}
```

The OpenUTAU fork should use that case to fall back to the existing renderer.
