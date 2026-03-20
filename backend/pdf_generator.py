"""
Generates a styled investment memo PDF using ReportLab.
Looks like a real M13 deal brief — dark header, section dividers, clean typography.
"""
import os
import re
import tempfile
from datetime import datetime


def generate_pdf(markdown_content: str, company_name: str) -> str:
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.lib.colors import HexColor, white, black
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer,
            HRFlowable, Table, TableStyle, KeepTogether
        )
        from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
        from reportlab.platypus import BaseDocTemplate, Frame, PageTemplate
        from reportlab.pdfgen import canvas as pdfcanvas
    except ImportError:
        raise RuntimeError("reportlab not installed. Run: pip install reportlab")

    # ── Colors ────────────────────────────────────────────────────────────────
    NAVY      = HexColor("#0f1923")
    NAVY_MID  = HexColor("#1c2d3d")
    ACCENT    = HexColor("#2563eb")
    MUTED     = HexColor("#6b6a65")
    BORDER    = HexColor("#e5e3de")
    BG_LIGHT  = HexColor("#f5f4f0")
    TEXT      = HexColor("#1a1a1a")
    TEXT_BODY = HexColor("#2a2a2a")

    # ── Output path ───────────────────────────────────────────────────────────
    safe_name = re.sub(r"[^\w\s-]", "", company_name).strip().replace(" ", "_")
    output_path = os.path.join(tempfile.gettempdir(), f"{safe_name}_brief.pdf")
    today = datetime.now().strftime("%B %d, %Y")

    # ── Page dimensions ───────────────────────────────────────────────────────
    PAGE_W, PAGE_H = letter
    MARGIN = 0.65 * inch
    CONTENT_W = PAGE_W - 2 * MARGIN

    # ── Header/footer drawn on every page ─────────────────────────────────────
    def draw_page(canvas, doc):
        canvas.saveState()

        # Dark header bar
        canvas.setFillColor(NAVY)
        canvas.rect(0, PAGE_H - 0.7 * inch, PAGE_W, 0.7 * inch, fill=1, stroke=0)

        # M13 logo circle
        canvas.setFillColor(ACCENT)
        canvas.circle(MARGIN + 0.18 * inch, PAGE_H - 0.35 * inch, 0.14 * inch, fill=1, stroke=0)
        canvas.setFillColor(white)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawCentredString(MARGIN + 0.18 * inch, PAGE_H - 0.39 * inch, "M")

        # Firm name
        canvas.setFillColor(white)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(MARGIN + 0.42 * inch, PAGE_H - 0.39 * inch, "M13")

        # Separator
        canvas.setFillColor(HexColor("#ffffff40"))
        canvas.rect(MARGIN + 0.7 * inch, PAGE_H - 0.46 * inch, 0.01 * inch, 0.22 * inch, fill=1, stroke=0)

        # Doc type
        canvas.setFillColor(HexColor("#ffffffaa"))
        canvas.setFont("Helvetica", 8)
        canvas.drawString(MARGIN + 0.82 * inch, PAGE_H - 0.39 * inch, "Meeting Brief — Confidential")

        # Date top right
        canvas.setFillColor(HexColor("#ffffff66"))
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(PAGE_W - MARGIN, PAGE_H - 0.39 * inch, today)

        # Footer line
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, 0.55 * inch, PAGE_W - MARGIN, 0.55 * inch)

        # Footer text
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(MARGIN, 0.38 * inch, f"{company_name} — M13 Meeting Brief")
        canvas.drawRightString(PAGE_W - MARGIN, 0.38 * inch, f"Page {doc.page}")

        canvas.restoreState()

    # ── Styles ────────────────────────────────────────────────────────────────
    def style(name, **kwargs):
        defaults = dict(fontName="Helvetica", fontSize=10, leading=15,
                        textColor=TEXT_BODY, spaceAfter=4, spaceBefore=0,
                        alignment=TA_LEFT)
        defaults.update(kwargs)
        return ParagraphStyle(name, **defaults)

    S_COMPANY   = style("company",   fontName="Helvetica-Bold", fontSize=22,
                        textColor=NAVY, leading=26, spaceAfter=4)
    S_SUBTITLE  = style("subtitle",  fontSize=11, textColor=MUTED, spaceAfter=2)
    S_CONTEXT   = style("context",   fontSize=9, textColor=MUTED,
                        spaceAfter=0, fontName="Helvetica-Oblique")
    S_H2        = style("h2",        fontName="Helvetica-Bold", fontSize=11,
                        textColor=NAVY, spaceBefore=14, spaceAfter=5, leading=14)
    S_BODY      = style("body",      fontSize=10, leading=16, spaceAfter=6,
                        textColor=TEXT_BODY)
    S_BULLET    = style("bullet",    fontSize=10, leading=16, spaceAfter=4,
                        leftIndent=12, firstLineIndent=0, textColor=TEXT_BODY)
    S_LABEL     = style("label",     fontName="Helvetica-Bold", fontSize=8,
                        textColor=MUTED, spaceAfter=2, leading=10)
    S_SMALL     = style("small",     fontSize=8, textColor=MUTED, leading=11)

    # ── Parse markdown → ReportLab flowables ──────────────────────────────────
    def md_inline(text: str) -> str:
        """Convert inline **bold** and *italic* to ReportLab XML."""
        text = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', text)
        text = re.sub(r'\*(.+?)\*',     r'<i>\1</i>', text)
        text = re.sub(r'`(.+?)`',       r'<font name="Courier" size="9">\1</font>', text)
        # Escape bare ampersands not already in an entity
        text = re.sub(r'&(?!#?\w+;)', '&amp;', text)
        return text

    def build_story(md: str) -> list:
        story = []
        lines = md.strip().split("\n")
        i = 0

        while i < len(lines):
            line = lines[i].rstrip()

            if not line:
                story.append(Spacer(1, 0.06 * inch))
                i += 1
                continue

            # H1 — treat as company title block
            if line.startswith("# "):
                text = md_inline(line[2:].strip())
                story.append(Paragraph(text, S_COMPANY))
                i += 1
                continue

            # H2 — section header with accent rule
            if line.startswith("## "):
                text = line[3:].strip()
                story.append(Spacer(1, 0.08 * inch))
                # Accent left bar via table
                section_table = Table(
                    [[Paragraph(text.upper(), style("h2t",
                        fontName="Helvetica-Bold", fontSize=9,
                        textColor=ACCENT, leading=12, spaceAfter=0))]],
                    colWidths=[CONTENT_W],
                )
                section_table.setStyle(TableStyle([
                    ('LEFTPADDING',  (0, 0), (-1, -1), 8),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                    ('TOPPADDING',   (0, 0), (-1, -1), 5),
                    ('BOTTOMPADDING',(0, 0), (-1, -1), 5),
                    ('LINEBEFORE',   (0, 0), (0, 0), 2.5, ACCENT),
                    ('BACKGROUND',   (0, 0), (-1, -1), HexColor("#f0f4ff")),
                    ('ROUNDEDCORNERS', [4]),
                ]))
                story.append(section_table)
                story.append(Spacer(1, 0.05 * inch))
                i += 1
                continue

            # H3
            if line.startswith("### "):
                text = md_inline(line[4:].strip())
                story.append(Paragraph(text, style("h3",
                    fontName="Helvetica-Bold", fontSize=10,
                    textColor=NAVY, spaceBefore=8, spaceAfter=3)))
                i += 1
                continue

            # Bullet
            if line.startswith("- ") or line.startswith("* "):
                text = md_inline(line[2:].strip())
                story.append(Paragraph(f"&bull;&nbsp;&nbsp;{text}", S_BULLET))
                i += 1
                continue

            # Numbered list
            num_match = re.match(r'^(\d+)\.\s+(.*)', line)
            if num_match:
                num, text = num_match.group(1), md_inline(num_match.group(2).strip())
                story.append(Paragraph(f"{num}.&nbsp;&nbsp;{text}", S_BULLET))
                i += 1
                continue

            # HR
            if line.strip() in ("---", "***", "___"):
                story.append(Spacer(1, 0.06 * inch))
                story.append(HRFlowable(width="100%", thickness=0.5,
                                        color=BORDER, spaceAfter=6))
                i += 1
                continue

            # Normal paragraph
            text = md_inline(line)
            if text.strip():
                story.append(Paragraph(text, S_BODY))
            i += 1

        return story

    # ── Assemble document ─────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=0.9 * inch,   # space for header bar
        bottomMargin=0.75 * inch,
        title=f"{company_name} — M13 Meeting Brief",
        author="M13",
    )

    story = []

    # Company title block
    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph(company_name, S_COMPANY))
    story.append(Paragraph("Meeting Brief", S_SUBTITLE))
    story.append(Paragraph(f"Prepared {today} · Confidential", S_CONTEXT))
    story.append(Spacer(1, 0.12 * inch))
    story.append(HRFlowable(width="100%", thickness=1, color=NAVY, spaceAfter=16))

    # Main content
    story.extend(build_story(markdown_content))

    # Footer spacer
    story.append(Spacer(1, 0.3 * inch))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=6))
    story.append(Paragraph(
        "This document is confidential and prepared for internal M13 use only.",
        style("disclaimer", fontSize=7.5, textColor=MUTED, alignment=TA_CENTER)
    ))

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)
    return output_path