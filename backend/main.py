from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
import asyncio
import json
import os
from dotenv import load_dotenv

load_dotenv()

from orchestrator import run_orchestrator
from pdf_generator import generate_pdf

app = FastAPI(title="M13 Meeting Prep API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BriefRequest(BaseModel):
    company_name: str
    meeting_context: str  # e.g. "Series A intro call with founder"
    founder_name: str = ""


class PDFRequest(BaseModel):
    markdown_content: str
    company_name: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/brief/stream")
async def brief_stream(req: BriefRequest):
    """
    Streams the briefing doc as it's generated.
    Yields SSE-style chunks: data: {"type": "status"|"content"|"done", "text": "..."}
    """
    async def event_generator():
        try:
            async for chunk in run_orchestrator(
                company_name=req.company_name,
                meeting_context=req.meeting_context,
                founder_name=req.founder_name,
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
                await asyncio.sleep(0)  # allow event loop to breathe
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/brief/pdf")
async def brief_pdf(req: PDFRequest):
    """
    Converts a markdown briefing to a downloadable PDF.
    """
    try:
        pdf_path = generate_pdf(req.markdown_content, req.company_name)
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"{req.company_name.replace(' ', '_')}_brief.pdf",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
