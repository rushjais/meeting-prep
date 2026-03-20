"""
Chat endpoint — context-aware Q&A for Meeting Prep and Benchmarking pages.
Receives the current page context (brief or benchmark analysis) + conversation history.
"""
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json
import os
import asyncio
from openai import AsyncOpenAI

router = APIRouter()


class ChatMessage(BaseModel):
    role: str   # 'user' | 'assistant'
    content: str


class ChatRequest(BaseModel):
    message: str
    context: str                        # current brief or benchmark analysis
    context_type: str                   # 'brief' | 'benchmark'
    context_label: str                  # e.g. company name or "3-company benchmark"
    history: list[ChatMessage] = []


CHAT_SYSTEM = """You are an investment analyst assistant at M13, an early-stage VC firm.
You are helping an investor think through deals and portfolio data.

You have been given context — either a meeting brief for a specific company,
or a portfolio benchmark analysis. Use this context to answer questions directly and precisely.

Guidelines:
- Be concise and sharp. Investors are busy.
- Reference specific numbers and facts from the context when relevant.
- If asked something not covered by the context, say so and answer from general VC knowledge.
- You can suggest follow-up questions or angles the investor might not have considered.
- Never make up data that isn't in the context.
"""


@router.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    async def generate():
        client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

        # Build messages
        messages = [{"role": "system", "content": CHAT_SYSTEM}]

        # Inject context as a system message
        context_header = (
            f"MEETING BRIEF — {req.context_label}"
            if req.context_type == "brief"
            else f"BENCHMARK ANALYSIS — {req.context_label}"
        )
        messages.append({
            "role": "system",
            "content": f"Current context ({context_header}):\n\n{req.context}"
        })

        # Add conversation history
        for msg in req.history[-10:]:  # keep last 10 turns
            messages.append({"role": msg.role, "content": msg.content})

        # Add current message
        messages.append({"role": "user", "content": req.message})

        stream = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=800,
            temperature=0.4,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield f"data: {json.dumps({'type': 'content', 'text': delta.content})}\n\n"
                await asyncio.sleep(0)

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )