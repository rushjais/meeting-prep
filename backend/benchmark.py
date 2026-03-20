"""
Portfolio benchmarking endpoint.
Takes KPIs for multiple companies, normalizes them, and returns
GPT-4o commentary comparing them by stage, sector, and cohort.
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


class Company(BaseModel):
    name: str
    stage: str           # Seed / Series A / Series B
    sector: str          # AI / Fintech / Health / Commerce / Work
    arr: Optional[float] = None          # Annual Recurring Revenue ($K)
    arr_growth: Optional[float] = None   # YoY growth %
    burn: Optional[float] = None         # Monthly burn ($K)
    runway: Optional[float] = None       # Months of runway
    headcount: Optional[int] = None
    nrr: Optional[float] = None          # Net Revenue Retention %
    gross_margin: Optional[float] = None # %
    notes: Optional[str] = None


class BenchmarkRequest(BaseModel):
    companies: list[Company]


BENCHMARK_SYSTEM = """You are a VC analyst at M13, an early-stage venture firm.
You are analyzing KPI data across multiple portfolio companies or prospects.

Your job is to write a sharp, structured benchmark analysis in Markdown with these sections:

## Summary
2-3 sentence overview of the cohort — what stands out, what concerns you.

## Company-by-company assessment
For each company: one paragraph covering their KPI profile, what's strong, what's missing or concerning, 
and how they compare to stage/sector benchmarks. Be specific — reference actual numbers.

## Cohort patterns
What trends do you see across the group? Any sectors outperforming? Any red flags that appear in multiple companies?

## Recommended focus areas
For M13's investment team: what should they dig into further? Which companies look most compelling and why?

Use real VC benchmarks where relevant:
- Seed SaaS: $0-1M ARR, >10% MoM growth
- Series A SaaS: $1-5M ARR, >100% YoY growth, <18mo burn
- Series B SaaS: $5-20M ARR, >80% YoY growth, NRR >110%
- Good gross margins: SaaS >70%, Marketplace >50%
- Strong NRR: >120% exceptional, >100% good, <90% concerning

Be direct. No filler. This is for experienced investors."""


def format_companies(companies: list[Company]) -> str:
    lines = []
    for c in companies:
        lines.append(f"\n### {c.name}")
        lines.append(f"- Stage: {c.stage} | Sector: {c.sector}")
        if c.arr is not None:
            lines.append(f"- ARR: ${c.arr:,.0f}K")
        if c.arr_growth is not None:
            lines.append(f"- ARR Growth (YoY): {c.arr_growth:.0f}%")
        if c.nrr is not None:
            lines.append(f"- Net Revenue Retention: {c.nrr:.0f}%")
        if c.gross_margin is not None:
            lines.append(f"- Gross Margin: {c.gross_margin:.0f}%")
        if c.burn is not None:
            lines.append(f"- Monthly Burn: ${c.burn:,.0f}K")
        if c.runway is not None:
            lines.append(f"- Runway: {c.runway:.0f} months")
        if c.headcount is not None:
            lines.append(f"- Headcount: {c.headcount}")
        if c.notes:
            lines.append(f"- Notes: {c.notes}")
    return "\n".join(lines)


@router.post("/benchmark/stream")
async def benchmark_stream(req: BenchmarkRequest):
    async def generate():
        if len(req.companies) < 2:
            yield f"data: {json.dumps({'type': 'error', 'text': 'Add at least 2 companies to benchmark.'})}\n\n"
            return

        client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
        company_data = format_companies(req.companies)

        user_prompt = f"""Analyze and benchmark these {len(req.companies)} companies:

{company_data}

Write the structured benchmark analysis now."""

        yield f"data: {json.dumps({'type': 'status', 'text': 'Analyzing KPIs and running benchmarks...'})}\n\n"
        await asyncio.sleep(0)

        stream = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": BENCHMARK_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=1800,
            temperature=0.3,
            stream=True,
        )

        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield f"data: {json.dumps({'type': 'content', 'text': delta.content})}\n\n"
                await asyncio.sleep(0)

        yield f"data: {json.dumps({'type': 'done', 'text': ''})}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )