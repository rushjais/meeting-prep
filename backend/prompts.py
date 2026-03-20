BRIEFING_SYSTEM_PROMPT = """You are an investment analyst at M13, an early-stage VC firm.
Your job is to write a concise, high-signal meeting brief for an investor preparing for a call.

Format the brief in clean Markdown with these exact sections:
1. **Company snapshot** — 2-3 sentences on what they do, stage, and why it matters
2. **Funding & traction** — latest round, investors, key metrics if available
3. **Founder background** — relevant experience and signals of quality
4. **Recent news** — 2-3 most relevant recent developments
5. **M13 thesis fit** — how this company maps to M13's investment areas (reference specific portfolio comps)
6. **Prior relationship** — summary of any past interaction from CRM; "No prior contact" if none
7. **Suggested talking points** — 4-5 sharp questions or angles for the meeting

Keep the tone sharp and direct — investors are busy. No filler. Each section should be skimmable in 10 seconds.
Do not invent data. If something is unknown, say so briefly and move on.
"""


def build_user_prompt(
    company_name: str,
    meeting_context: str,
    tavily_data: dict,
    crm_data: dict,
    rag_results: list[dict],
) -> str:
    # Format Tavily intel
    news_section = _format_tavily(tavily_data.get("recent_news", {}))
    funding_section = _format_tavily(tavily_data.get("funding", {}))
    founder_section = _format_tavily(tavily_data.get("founder", {}))

    # Format CRM notes
    crm_section = _format_crm(crm_data)

    # Format RAG context
    rag_section = _format_rag(rag_results)

    return f"""
Prepare a meeting brief for: **{company_name}**
Meeting context: {meeting_context}

---
## Web research

### Recent news
{news_section}

### Funding history
{funding_section}

### Founder background
{founder_section}

---
## CRM / prior notes
{crm_section}

---
## Relevant M13 portfolio context (for thesis fit and comps)
{rag_section}

---
Now write the structured brief.
""".strip()


def _format_tavily(section: dict) -> str:
    if not section:
        return "No data found."
    lines = []
    if section.get("answer"):
        lines.append(section["answer"])
    for src in section.get("sources", [])[:3]:
        if src.get("snippet"):
            lines.append(f"- **{src['title']}**: {src['snippet']}")
    return "\n".join(lines) if lines else "No data found."


def _format_crm(crm_data: dict) -> str:
    if not crm_data or not crm_data.get("found"):
        return "No prior contact in CRM."
    records = crm_data.get("records", [])
    if not records:
        return "No prior contact in CRM."
    lines = []
    if crm_data.get("mock"):
        lines.append("*(Demo CRM data)*")
    for r in records:
        lines.append(f"**Stage:** {r.get('stage', 'Unknown')}")
        if r.get("assigned_to"):
            lines.append(f"**Assigned to:** {r['assigned_to']}")
        if r.get("last_contact"):
            lines.append(f"**Last contact:** {r['last_contact']}")
        if r.get("notes"):
            lines.append(f"**Notes:** {r['notes']}")
        if r.get("tags"):
            lines.append(f"**Tags:** {', '.join(r['tags'])}")
    return "\n".join(lines)


def _format_rag(rag_results: list[dict]) -> str:
    if not rag_results:
        return "No relevant thesis context retrieved."
    return "\n\n".join(
        f"**[{r['id']}]** {r['text']}"
        for r in rag_results
    )
