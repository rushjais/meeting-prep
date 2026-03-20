import os
import re
import tempfile


def generate_pdf(markdown_content: str, company_name: str) -> str:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
        from reportlab.lib.colors import HexColor
    except ImportError:
        raise RuntimeError("reportlab not installed. Run: pip install reportlab")

    safe_name = re.sub(r"[^\w\s-]", "", company_name).strip().replace(" ", "_")
    output_path = os.path.join(tempfile.gettempdir(), f"{safe_name}_brief.pdf")

    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )

    styles = getSampleStyleSheet()
    navy = HexColor("#0f1923")
    muted = HexColor("#6b6a65")

    title_style = ParagraphStyle("title", parent=styles["Heading1"],
        fontSize=20, textColor=navy, spaceAfter=6)
    h2_style = ParagraphStyle("h2", parent=styles["Heading2"],
        fontSize=13, textColor=navy, spaceBefore=16, spaceAfter=4)
    body_style = ParagraphStyle("body", parent=styles["Normal"],
        fontSize=10, leading=15, spaceAfter=4)
    bullet_style = ParagraphStyle("bullet", parent=styles["Normal"],
        fontSize=10, leading=15, leftIndent=16, spaceAfter=3)

    story = []
    story.append(Paragraph(f"{company_name} — M13 Meeting Brief", title_style))
    story.append(Spacer(1, 0.15 * inch))

    for line in markdown_content.split("\n"):
        line = line.strip()
        if not line:
            story.append(Spacer(1, 0.05 * inch))
        elif line.startswith("## "):
            story.append(Paragraph(line[3:], h2_style))
        elif line.startswith("# "):
            story.append(Paragraph(line[2:], title_style))
        elif line.startswith("- ") or line.startswith("* "):
            text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", line[2:])
            story.append(Paragraph(f"• {text}", bullet_style))
        else:
            text = re.sub(r"\*\*(.*?)\*\*", r"<b>\1</b>", line)
            story.append(Paragraph(text, body_style))

    doc.build(story)
    return output_path