"""
Lightweight RAG over M13's public thesis and portfolio content.
Uses FAISS + OpenAI embeddings (text-embedding-3-small).

On first run, builds the index from M13_CORPUS (hardcoded seed data).
In production, you'd scrape m13.co/portfolio and m13.co/insights periodically.
"""
import os
import json
import asyncio
import numpy as np
import faiss
from openai import AsyncOpenAI
from typing import Any

# ── Seed corpus: M13 thesis + portfolio summaries ────────────────────────────
M13_CORPUS = [
    {
        "id": "thesis_ai",
        "text": "M13 invests heavily in AI-native workflow automation. Key thesis: AI replacing painful back-office work in healthcare and enterprise. Portfolio includes MavenAGI (enterprise AI agents for customer experience), NormAI (regulatory compliance), Polimorphic (local government AI), Carenostics (chronic disease AI diagnostics).",
    },
    {
        "id": "thesis_fintech",
        "text": "M13's fintech strategy focuses on the future of money movement, private markets infrastructure, and financial access. Key portfolio: Allocate (private market investing platform, Series B $30.5M), Hivemapper (decentralized mapping via crypto), Code (Solana-based payments and messaging).",
    },
    {
        "id": "thesis_work",
        "text": "M13 invests in the future of work — tools that augment or automate knowledge work. Focus on B2B SaaS and AI-enabled productivity. Portfolio: AllVoices (employee relations), Estuary (real-time data platform for AI era), Zenlytic (agentic BI and business insights).",
    },
    {
        "id": "thesis_health",
        "text": "M13 health thesis: AI-enabled clinical tools, telehealth infrastructure, chronic disease management. Portfolio: Form Health (medical weight loss telehealth), Canvas Medical (EMR platform), Carenostics (AI for chronic disease), Ayble Health (digestive health).",
    },
    {
        "id": "thesis_commerce",
        "text": "M13 commerce thesis: ecommerce infrastructure, brand data platforms, supply chain. Portfolio: Chord AI (commerce data platform), Replenysh (circular supply chain), Rebuy (ecommerce personalization). Past exits: ClassPass, Daily Harvest, Capsule.",
    },
    {
        "id": "stage_pref",
        "text": "M13 invests at Seed and Series A stages. Typical check sizes are in the range of $1M-$5M at seed and $5M-$15M at Series A. They look for founders with strong technical backgrounds building defensible software businesses with clear enterprise or B2B2C models.",
    },
    {
        "id": "propulsion",
        "text": "M13's Propulsion model: 3 operators for every 1 investor. They provide hands-on support in go-to-market, talent, product, and finance. This is a key differentiator in pitches — founders get operational support, not just capital. Mention Propulsion as a value-add.",
    },
    {
        "id": "portfolio_ai_infra",
        "text": "M13 AI infrastructure portfolio: Mako (GPU performance optimization for AI inference), Estuary (right-time data platform), Teleskope (agentic data security). These reflect M13's view that AI infrastructure layer is as important as application layer.",
    },
    {
        "id": "portfolio_recent",
        "text": "Recent M13 investments (2025-2026): Luminos.AI (AI risk management for law firms), Teleskope (data security via agentic automation), Estuary (real-time data platform), Robyn (AI for home services), Sitch (AI matchmaking). Shows continued focus on AI-native applications.",
    },
    {
        "id": "exit_history",
        "text": "Notable M13 exits: Prepared (AI for 911 emergency response, acquired by Axon), ClassPass (fitness marketplace unicorn), Daily Harvest (DTC food brand), Capsule (pharmacy). 25+ exits total, 3 unicorns in current portfolio.",
    },
]

# ── Global index state ────────────────────────────────────────────────────────
_index: faiss.IndexFlatIP | None = None
_embeddings_map: list[dict] = []
_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


async def _embed(texts: list[str]) -> np.ndarray:
    client = _get_client()
    response = await client.embeddings.create(
        model="text-embedding-3-small",
        input=texts,
    )
    vecs = [e.embedding for e in response.data]
    arr = np.array(vecs, dtype="float32")
    # Normalize for cosine similarity via inner product
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    arr = arr / np.maximum(norms, 1e-9)
    return arr


async def build_index():
    """Embed corpus and build FAISS index. Called once on startup."""
    global _index, _embeddings_map
    texts = [item["text"] for item in M13_CORPUS]
    vecs = await _embed(texts)
    dim = vecs.shape[1]
    _index = faiss.IndexFlatIP(dim)
    _index.add(vecs)
    _embeddings_map = M13_CORPUS
    print(f"[RAG] Index built: {len(M13_CORPUS)} documents, dim={dim}")


async def retrieve(query: str, top_k: int = 3) -> list[dict[str, Any]]:
    """
    Returns the top_k most relevant M13 corpus entries for the query.
    Builds the index on first call if not already built.
    """
    global _index
    if _index is None:
        await build_index()

    q_vec = await _embed([query])
    scores, indices = _index.search(q_vec, top_k)

    results = []
    for score, idx in zip(scores[0], indices[0]):
        if idx < len(_embeddings_map):
            results.append({
                "text": _embeddings_map[idx]["text"],
                "id": _embeddings_map[idx]["id"],
                "score": float(score),
            })
    return results
