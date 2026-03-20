# M13 Meeting Prep — AI Briefing Generator

Generates structured investor briefing documents ahead of meetings by pulling from live web search, CRM notes, and M13 thesis context.

## Stack
- **Backend**: FastAPI + Python (Tavily, OpenAI, FAISS, Airtable)
- **Frontend**: React + Vite (react-markdown)

## Setup

### 1. Clone and configure environment
```bash
cd backend
cp .env.example .env
# Fill in your API keys in .env
```

Required keys:
| Key | Where to get it |
|-----|----------------|
| `OPENAI_API_KEY` | platform.openai.com |
| `TAVILY_API_KEY` | app.tavily.com |
| `AIRTABLE_API_KEY` | airtable.com/create/tokens |
| `AIRTABLE_BASE_ID` | Your base URL: airtable.com/`appXXXXX`/... |

> **Note**: Airtable is optional for the demo — if not configured, the app uses realistic mock CRM data automatically.

### 2. Start the backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Start the frontend
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Airtable CRM Schema

Create a table called `Deals` with these fields:
| Field | Type |
|-------|------|
| Company | Single line text |
| Stage | Single select |
| Notes | Long text |
| LastContact | Date |
| AssignedTo | Single line text |
| Tags | Multiple select |

## How it works

1. User enters company name + meeting context
2. FastAPI receives the request and kicks off 3 parallel tasks:
   - **Tavily**: 3 concurrent searches (recent news, funding, founder background)
   - **Airtable**: looks up prior deal notes by company name
   - **FAISS RAG**: retrieves relevant M13 thesis/portfolio context via semantic search
3. All results feed into a GPT-4o prompt
4. Response streams back token-by-token via SSE
5. User can copy markdown or download a styled PDF

## Project structure
```
meeting-prep/
├── backend/
│   ├── main.py           # FastAPI app + endpoints
│   ├── orchestrator.py   # Parallel data gathering + GPT-4o streaming
│   ├── tavily_client.py  # Live web search
│   ├── airtable_client.py # CRM notes
│   ├── rag.py            # FAISS index over M13 corpus
│   ├── prompts.py        # Prompt templates
│   ├── pdf_generator.py  # Markdown → PDF
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── App.jsx       # Main UI
    │   └── main.jsx
    └── package.json
```

## Extending

- **Add more corpus**: Edit `M13_CORPUS` in `rag.py` with additional M13 portfolio/thesis content. Scrape `m13.co/portfolio` periodically to keep it fresh.
- **Add Crunchbase**: Swap the Tavily funding search for the Crunchbase API to get cleaner structured funding data.
- **Slack integration**: Post the generated brief to the relevant deal channel automatically.
