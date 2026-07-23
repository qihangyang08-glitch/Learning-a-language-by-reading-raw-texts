import os
import tempfile
from pathlib import Path

import edge_tts
from fastapi import BackgroundTasks, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

DEFAULT_VOICE = os.getenv("EDGE_TTS_VOICE", "ja-JP-NanamiNeural")
MAX_TEXT_CHARS = int(os.getenv("EDGE_TTS_MAX_TEXT_CHARS", "500"))

app = FastAPI(title="JaReader Edge TTS", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "engine": "edge-tts", "defaultVoice": DEFAULT_VOICE}


@app.get("/voices")
async def voices() -> dict[str, list[dict[str, str]]]:
    all_voices = await edge_tts.list_voices()
    japanese = [
        {
            "shortName": v.get("ShortName", ""),
            "locale": v.get("Locale", ""),
            "gender": v.get("Gender", ""),
            "displayName": v.get("FriendlyName", ""),
        }
        for v in all_voices
        if str(v.get("Locale", "")).lower().startswith("ja")
    ]
    return {"voices": japanese}


@app.get("/tts")
async def tts(
    background_tasks: BackgroundTasks,
    text: str = Query(..., min_length=1),
    voice: str = Query(DEFAULT_VOICE),
    rate: str = Query("+0%"),
) -> FileResponse:
    normalized = " ".join(text.split())
    if not normalized:
        raise HTTPException(status_code=400, detail="text is empty")
    if len(normalized) > MAX_TEXT_CHARS:
        normalized = normalized[:MAX_TEXT_CHARS]

    try:
        fd, path = tempfile.mkstemp(prefix="jareader-edge-tts-", suffix=".mp3")
        os.close(fd)
        communicate = edge_tts.Communicate(normalized, voice=voice, rate=normalize_rate(rate))
        await communicate.save(path)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"edge-tts failed: {exc}") from exc

    output = Path(path)
    if not output.exists() or output.stat().st_size == 0:
        raise HTTPException(status_code=502, detail="edge-tts returned empty audio")

    background_tasks.add_task(unlink_file, output)
    return FileResponse(
        output,
        media_type="audio/mpeg",
        filename="tts.mp3",
        headers={"Cache-Control": "no-store"},
    )


def unlink_file(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass


def normalize_rate(rate: str) -> str:
    value = rate.strip()
    if not value:
        return "+0%"
    if value.endswith("%") and not value.startswith(("+", "-")):
        return f"+{value}"
    return value
