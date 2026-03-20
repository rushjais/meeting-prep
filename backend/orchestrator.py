"""
Orchestrator: runs Tavily, Airtable, and RAG in parallel,
then streams GPT-4o output token-by-token.

Yields dicts: {"type": "status"|"content"|"done", "text": "..."}
"""
import asyncio
import os
from openai import AsyncOpenAI
from typing import AsyncGenerator

from tavily_client import fetch_company_intel
from airtable_client import fetch_crm_notes
from rag import retrieve
from prompts import BRIEFING_SYSTEM_PROMPT, build_user_prompt


async def run_orchestrator(
    company_name: str,
    meeting_context: str,
    founder_name: str = "",
) -> AsyncGenerator[dict, None]:

    client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])

    # ── Step 1: Parallel data gathering ──────────────────────────────────────
    yield {"type": "status", "text": "Searching the web for recent news..."}

    tavily_task = asyncio.create_task(
        fetch_company_intel(company_name, founder_name)
    )
    crm_task = asyncio.create_task(
        fetch_crm_notes(company_name)
    )
    rag_task = asyncio.create_task(
        retrieve(f"{company_name} {meeting_context}", top_k=3)
    )

    yield {"type": "status", "text": "Pulling CRM notes and thesis context..."}

    tavily_data, crm_data, rag_results = await asyncio.gather(
        tavily_task, crm_task, rag_task
    )

    # Emit deduplicated sources so the frontend can show citations
    all_sources = []
    seen_urls = set()
    for section_key in ("recent_news", "funding", "founder"):
        for src in tavily_data.get(section_key, {}).get("sources", []):
            url = src.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                all_sources.append({"title": src.get("title", url), "url": url, "snippet": src.get("snippet", "")})
    yield {"type": "sources", "sources": all_sources[:9]}

    yield {"type": "status", "text": "Synthesizing briefing with GPT-4o..."}

    # ── Step 2: Build prompt ──────────────────────────────────────────────────
    user_prompt = build_user_prompt(
        company_name=company_name,
        meeting_context=meeting_context,
        tavily_data=tavily_data,
        crm_data=crm_data,
        rag_results=rag_results,
    )

    # ── Step 3: Stream GPT-4o response ───────────────────────────────────────
    stream = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": BRIEFING_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=1500,
        temperature=0.3,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield {"type": "content", "text": delta.content}

    yield {"type": "done", "text": ""}
