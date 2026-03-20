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
from benchmark import router as benchmark_router
from chat import router as chat_router

app = FastAPI(title="M13 Meeting Prep API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://localhost:3000",
    "https://*.vercel.app",
],
)

app.include_router(benchmark_router)
app.include_router(chat_router)


class BriefRequest(BaseModel):
    company_name: str
    meeting_context: str
    founder_name: str = ""


class PDFRequest(BaseModel):
    markdown_content: str
    company_name: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/brief/stream")
async def brief_stream(req: BriefRequest):
    async def event_generator():
        try:
            async for chunk in run_orchestrator(
                company_name=req.company_name,
                meeting_context=req.meeting_context,
                founder_name=req.founder_name,
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
                await asyncio.sleep(0)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'text': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/brief/pdf")
async def brief_pdf(req: PDFRequest):
    try:
        pdf_path = generate_pdf(req.markdown_content, req.company_name)
        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"{req.company_name.replace(' ', '_')}_brief.pdf",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))