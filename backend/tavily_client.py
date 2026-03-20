from tavily import TavilyClient
import os
import asyncio
from typing import Any

_client = None

def get_client() -> TavilyClient:
    global _client
    if _client is None:
        _client = TavilyClient(api_key=os.environ["TAVILY_API_KEY"])
    return _client


def _search_sync(query: str, max_results: int = 5) -> list[dict]:
    client = get_client()
    response = client.search(
        query=query,
        max_results=max_results,
        search_depth="advanced",
        include_answer=True,
    )
    return response


async def fetch_company_intel(company_name: str, founder_name: str = "") -> dict[str, Any]:
    """
    Runs 3 parallel Tavily searches:
      1. Recent company news
      2. Funding history
      3. Founder background (if provided)
    Returns a structured dict ready for the prompt.
    """
    loop = asyncio.get_event_loop()

    queries = [
        f"{company_name} startup news 2024 2025",
        f"{company_name} funding raised investors valuation",
    ]
    if founder_name:
        queries.append(f"{founder_name} founder background career")
    else:
        queries.append(f"{company_name} founder CEO background")

    # Run searches concurrently using thread executor (Tavily is sync)
    tasks = [
        loop.run_in_executor(None, _search_sync, q, 4)
        for q in queries
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    def extract(result, label: str) -> dict:
        if isinstance(result, Exception):
            return {"label": label, "answer": "", "sources": []}
        return {
            "label": label,
            "answer": result.get("answer", ""),
            "sources": [
                {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": r.get("content", "")[:300]}
                for r in result.get("results", [])
            ],
        }

    return {
        "recent_news": extract(results[0], "Recent news"),
        "funding": extract(results[1], "Funding history"),
        "founder": extract(results[2], "Founder background"),
    }
