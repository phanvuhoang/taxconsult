"""routes/references.py — Reference article library endpoints."""
import io
import json as _json
import re

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_

from backend.database import get_db
from backend.models import User, ReferenceArticle
from backend.auth import get_current_user

router = APIRouter(prefix="/api/references", tags=["references"])

FORM_TYPES = ["quick_research", "full_report", "analysis", "press", "scenario", "advice", "other"]
FORM_TYPE_LABELS = {
    "quick_research": "Quick Research",
    "full_report": "Full Report",
    "analysis": "Bài phân tích",
    "press": "Bài báo",
    "scenario": "Tình huống thuế",
    "advice": "Thư tư vấn",
    "other": "Khác",
}


class AddReferenceRequest(BaseModel):
    source_type: str          # "url" | "paste"
    url: Optional[str] = None
    content: Optional[str] = None
    title: Optional[str] = None
    tax_types: Optional[List[str]] = []
    form_type: Optional[str] = ""
    tags: Optional[List[str]] = []


class UpdateReferenceRequest(BaseModel):
    title: Optional[str] = None
    tax_types: Optional[List[str]] = None
    form_type: Optional[str] = None
    tags: Optional[List[str]] = None


def _article_dict(a: ReferenceArticle, include_content: bool = False) -> dict:
    d = {
        "id": a.id,
        "title": a.title,
        "source_url": a.source_url,
        "source_type": a.source_type,
        "tax_types": a.tax_types or [],
        "form_type": a.form_type or "other",
        "tags": a.tags or [],
        "auto_classified": a.auto_classified,
        "char_count": a.char_count or 0,
        "gamma_url": a.gamma_url,
        "created_at": a.created_at.strftime("%d/%m/%Y %H:%M") if a.created_at else "",
    }
    if include_content:
        d["content_html"] = a.content_html or ""
        d["content_text"] = a.content_text or ""
    return d


async def _crawl_url(url: str) -> dict:
    """Crawl URL, extract title + text + html."""
    import httpx
    from bs4 import BeautifulSoup
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True,
                                     headers={"User-Agent": "Mozilla/5.0"}) as client:
            r = await client.get(url)
            r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        title = ""
        if soup.title:
            title = soup.title.get_text().strip()
        if not title and soup.find("h1"):
            title = soup.find("h1").get_text().strip()
        for tag in soup(["script", "style", "nav", "header", "footer", "aside", "ins", "iframe"]):
            tag.decompose()
        content_div = (
            soup.find("article") or
            soup.find(id="content") or
            soup.find(class_="content") or
            soup.find("main") or
            soup.body
        )
        html = str(content_div) if content_div else str(soup.body or soup)
        text = content_div.get_text(separator="\n", strip=True) if content_div else ""
        return {"title": title[:500], "text": text[:50000], "html": html[:100000]}
    except Exception as e:
        return {"title": "", "text": "", "html": "", "error": str(e)}


async def _auto_classify(text: str, title: str = "") -> dict:
    """Dùng AI (haiku) để classify tax_types và form_type."""
    from backend.ai_provider import call_ai
    prompt = f"""Phân loại bài viết thuế sau:

Tiêu đề: {title}
Nội dung (đầu bài): {text[:1500]}

Trả về JSON (không markdown):
{{
  "tax_types": [],
  "form_type": ""
}}

tax_types: list từ: TNDN, GTGT, TNCN, FCT, TTDB, XNK, TP, HKD, QLT, HOA_DON, THUE_QT
form_type: một trong: quick_research, full_report, analysis, press, scenario, advice, other

Chỉ trả JSON thuần, không giải thích."""

    try:
        result = await call_ai(
            messages=[{"role": "user", "content": prompt}],
            system="Bạn là classifier văn bản thuế. Chỉ trả JSON.",
            model_tier="haiku",
            max_tokens=200,
        )
        content = result.get("content", "")
        content = re.sub(r'^```json?\n?', '', content.strip())
        content = re.sub(r'\n?```$', '', content)
        data = _json.loads(content)
        valid_tax = ["TNDN", "GTGT", "TNCN", "FCT", "TTDB", "XNK", "TP", "HKD", "QLT", "HOA_DON", "THUE_QT"]
        return {
            "tax_types": [t for t in data.get("tax_types", []) if t in valid_tax],
            "form_type": data.get("form_type", "other") if data.get("form_type") in FORM_TYPES else "other",
        }
    except Exception:
        return {"tax_types": [], "form_type": "other"}


@router.post("/add")
async def add_reference(
    body: AddReferenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tax_list = body.tax_types or []
    form_type = body.form_type or ""
    tags_list = body.tags or []
    auto_classified = False

    if body.source_type == "url":
        if not body.url:
            raise HTTPException(status_code=400, detail="URL is required")
        crawled = await _crawl_url(body.url)
        if crawled.get("error") and not crawled.get("text"):
            raise HTTPException(status_code=400, detail=f"Không thể crawl URL: {crawled['error']}")
        extracted_title = body.title or crawled.get("title") or body.url[:100]
        content_text = crawled.get("text", "")
        content_html = crawled.get("html", "")
        source_url = body.url
    else:  # paste
        if not body.content:
            raise HTTPException(status_code=400, detail="Content is required")
        content_text = re.sub(r'<[^>]+>', ' ', body.content)
        content_text = re.sub(r'\s+', ' ', content_text).strip()
        content_html = body.content if body.content.strip().startswith("<") else ""
        # Extract title from first line if not provided
        if body.title:
            extracted_title = body.title
        else:
            first_line = content_text.strip().split("\n")[0][:200].strip()
            extracted_title = first_line or "Bài không có tiêu đề"
        source_url = None

    if not tax_list or not form_type:
        classified = await _auto_classify(content_text[:3000], extracted_title)
        if not tax_list:
            tax_list = classified.get("tax_types", [])
        if not form_type:
            form_type = classified.get("form_type", "other")
        auto_classified = True

    article = ReferenceArticle(
        user_id=user.id,
        title=extracted_title[:500],
        source_url=source_url,
        source_type=body.source_type,
        content_text=content_text[:50000],
        content_html=content_html[:100000] if content_html else None,
        char_count=len(content_text),
        tax_types=tax_list,
        form_type=form_type or "other",
        tags=tags_list,
        auto_classified=auto_classified,
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return _article_dict(article)


@router.post("/upload")
async def upload_reference(
    file: UploadFile = File(...),
    tax_types: str = Form(""),
    form_type: str = Form(""),
    tags: str = Form(""),
    title: str = Form(""),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or ""
    extracted_title = title or filename

    if filename.lower().endswith(".pdf"):
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages[:20])
        except Exception:
            try:
                from pdfminer.high_level import extract_text as pdfminer_extract
                text = pdfminer_extract(io.BytesIO(content))
            except Exception:
                text = ""
    elif filename.lower().endswith((".docx", ".doc")):
        from docx import Document
        doc = Document(io.BytesIO(content))
        text = "\n".join(p.text for p in doc.paragraphs)
    else:
        text = content.decode("utf-8", errors="ignore")

    if not extracted_title.strip() or extracted_title == filename:
        first_line = text.strip().split("\n")[0][:200].strip()
        if first_line:
            extracted_title = first_line

    tax_list = _json.loads(tax_types) if tax_types else []
    tags_list = _json.loads(tags) if tags else []

    auto_classified = False
    if not tax_list or not form_type:
        classified = await _auto_classify(text[:3000], extracted_title)
        if not tax_list:
            tax_list = classified.get("tax_types", [])
        if not form_type:
            form_type = classified.get("form_type", "other")
        auto_classified = True

    article = ReferenceArticle(
        user_id=user.id,
        title=extracted_title[:500],
        source_type="upload",
        content_text=text[:50000],
        char_count=len(text),
        tax_types=tax_list,
        form_type=form_type or "other",
        tags=tags_list,
        auto_classified=auto_classified,
    )
    db.add(article)
    await db.commit()
    await db.refresh(article)
    return _article_dict(article)


@router.get("")
async def list_references(
    tax_type: Optional[str] = None,
    form_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    q = select(ReferenceArticle).where(ReferenceArticle.user_id == user.id)
    if tax_type:
        q = q.where(ReferenceArticle.tax_types.contains([tax_type]))
    if form_type:
        q = q.where(ReferenceArticle.form_type == form_type)
    if search:
        search_pct = f"%{search}%"
        q = q.where(or_(
            ReferenceArticle.title.ilike(search_pct),
            ReferenceArticle.content_text.ilike(search_pct),
        ))
    q = q.order_by(ReferenceArticle.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(q)
    return [_article_dict(a) for a in result.scalars().all()]


@router.get("/{article_id}")
async def get_reference(
    article_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    article = await db.get(ReferenceArticle, article_id)
    if not article or article.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return _article_dict(article, include_content=True)


@router.patch("/{article_id}")
async def update_reference(
    article_id: int,
    body: UpdateReferenceRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    article = await db.get(ReferenceArticle, article_id)
    if not article or article.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    if body.title is not None:
        article.title = body.title[:500]
    if body.tax_types is not None:
        article.tax_types = body.tax_types
    if body.form_type is not None:
        article.form_type = body.form_type
    if body.tags is not None:
        article.tags = body.tags
    await db.commit()
    return _article_dict(article)


@router.delete("/{article_id}")
async def delete_reference(
    article_id: int,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    article = await db.get(ReferenceArticle, article_id)
    if not article or article.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(article)
    await db.commit()
    return {"ok": True}


@router.post("/{article_id}/gamma")
async def reference_gamma(
    article_id: int,
    body: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    article = await db.get(ReferenceArticle, article_id)
    if not article or article.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    if not article.content_text and not article.content_html:
        raise HTTPException(status_code=400, detail="Bài không có nội dung")

    num_cards = body.get("num_slides", 10)
    from backend.routes.reports import _create_gamma_presentation
    try:
        gamma_url = await _create_gamma_presentation(
            title=article.title[:100],
            html_content=article.content_html or article.content_text,
            num_cards=num_cards,
        )
        article.gamma_url = gamma_url
        await db.commit()
        return {"gamma_url": gamma_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gamma error: {str(e)}")
