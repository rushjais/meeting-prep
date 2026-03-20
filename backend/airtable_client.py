from pyairtable import Api
import os
from typing import Any


def get_table():
    api = Api(os.environ["AIRTABLE_API_KEY"])
    base_id = os.environ["AIRTABLE_BASE_ID"]
    table_name = os.environ.get("AIRTABLE_TABLE_NAME", "Deals")
    return api.table(base_id, table_name)


async def fetch_crm_notes(company_name: str) -> dict[str, Any]:
    """
    Searches the Airtable Deals table for records matching the company name.
    Expected columns: Company, Stage, Notes, LastContact, AssignedTo, Tags

    Returns a dict with deal history and notes, or empty dict if not found.
    Falls back gracefully if Airtable is not configured.
    """
    api_key = os.environ.get("AIRTABLE_API_KEY", "")
    base_id = os.environ.get("AIRTABLE_BASE_ID", "")

    if not api_key or not base_id or api_key == "pat...":
        return _mock_crm_data(company_name)

    try:
        table = get_table()
        # Airtable formula: case-insensitive search on Company field
        formula = f"SEARCH(LOWER('{company_name.lower()}'), LOWER({{Company}}))"
        records = table.all(formula=formula)

        if not records:
            return {"found": False, "company": company_name, "records": []}

        deals = []
        for r in records:
            f = r.get("fields", {})
            deals.append({
                "stage": f.get("Stage", "Unknown"),
                "notes": f.get("Notes", ""),
                "last_contact": f.get("LastContact", ""),
                "assigned_to": f.get("AssignedTo", ""),
                "tags": f.get("Tags", []),
            })

        return {"found": True, "company": company_name, "records": deals}

    except Exception as e:
        return {"found": False, "company": company_name, "error": str(e), "records": []}


def _mock_crm_data(company_name: str) -> dict[str, Any]:
    """
    Demo fallback when Airtable is not configured.
    Simulates realistic CRM data for demo purposes.
    """
    return {
        "found": True,
        "company": company_name,
        "mock": True,
        "records": [
            {
                "stage": "Initial Outreach",
                "notes": f"First contact via warm intro from portfolio founder. "
                         f"{company_name} is building in a space we've been tracking. "
                         "Team seems strong — repeat founders. Want to dig into unit economics on the call.",
                "last_contact": "2025-10-15",
                "assigned_to": "Morgan Blumberg",
                "tags": ["AI", "Enterprise", "Seed"],
            }
        ],
    }
