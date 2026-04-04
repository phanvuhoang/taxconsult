from sqlalchemy import (
    Column, Integer, String, Text, Boolean, DateTime, Date,
    ForeignKey, ARRAY, func
)
from datetime import datetime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from backend.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String(200), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    full_name = Column(String(200))
    role = Column(String(20), default="user")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())

    reports = relationship("Report", back_populates="user")
    research_sessions = relationship("ResearchSession", back_populates="user")


class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(500), nullable=False)
    subject = Column(Text, nullable=False)
    report_type = Column(String(20), nullable=False)  # 'quick' | 'full'
    tax_types = Column(ARRAY(Text))
    time_period = Column(String(100))
    content_html = Column(Text)
    content_json = Column(JSONB)
    citations = Column(JSONB, default=list)
    model_used = Column(String(100))
    provider_used = Column(String(50))
    prompt_tokens = Column(Integer, default=0)
    completion_tokens = Column(Integer, default=0)
    duration_ms = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="reports")


class TaxDoc(Base):
    __tablename__ = "tax_docs"

    id = Column(Integer, primary_key=True)
    so_hieu = Column(String(200))
    ten = Column(Text, nullable=False)
    loai = Column(String(20))  # Luat|ND|TT|VBHN|CV
    co_quan = Column(String(100))
    ngay_ban_hanh = Column(Date)
    hieu_luc_tu = Column(Date)
    het_hieu_luc_tu = Column(Date)
    tinh_trang = Column(String(50), default="con_hieu_luc")
    replaced_by = Column(String(200))
    replaced_date = Column(Date)
    tax_types = Column(ARRAY(Text))
    content_text = Column(Text)
    content_html = Column(Text)
    source = Column(String(50), default="upload")
    dbvntax_id = Column(Integer)
    link_tvpl = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class PriorityDoc(Base):
    __tablename__ = "priority_docs"

    id = Column(Integer, primary_key=True)
    dbvntax_id = Column(Integer, nullable=False, unique=True)
    so_hieu = Column(String(200))
    ten = Column(Text, nullable=False)
    loai = Column(String(20))          # Luat | ND | TT | VBHN | CV
    co_quan = Column(String(100))
    sac_thue = Column(ARRAY(Text))     # ['TNDN', 'GTGT', ...]

    # Hiệu lực
    hieu_luc_tu = Column(Date)
    hieu_luc_den = Column(Date)        # NULL = còn hiệu lực

    # Thay thế
    thay_the_boi = Column(String(200))
    pham_vi_het_hieu_luc = Column(String(20))  # "toan_bo" | "mot_phan" | NULL
    ghi_chu_hieu_luc = Column(Text)

    # Link
    link_tvpl = Column(Text)

    # Priority level (1=cao nhất, 5=thấp nhất)
    priority_level = Column(Integer, default=3)

    # Anchor period
    anchor_from = Column(Date, nullable=True)   # Anchor có hiệu lực từ ngày
    anchor_to   = Column(Date, nullable=True)   # Anchor hết hiệu lực (NULL = đang dùng)

    # Sort
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ReportJob(Base):
    __tablename__ = "report_jobs"

    id             = Column(String, primary_key=True)  # UUID
    subject        = Column(String)
    user_id        = Column(Integer, nullable=True)
    status         = Column(String, default="pending")  # pending|running|done|error
    progress_step  = Column(Integer, default=0)
    progress_total = Column(Integer, default=0)
    progress_label = Column(String, default="")
    html_content   = Column(Text, default="")
    error_msg      = Column(String, nullable=True)
    report_id      = Column(Integer, nullable=True)   # saved Report.id when done
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ContentJob(Base):
    __tablename__ = "content_jobs"

    id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.id"))
    content_type = Column(String(20), nullable=False)
    # content_type values: 'scenario' | 'analysis' | 'press' | 'advice'

    # Input fields
    subject = Column(Text, nullable=False)
    tax_types = Column(ARRAY(Text), default=list)
    time_period = Column(String(100))
    model_tier = Column(String(30), default="deepseek")
    client_name = Column(String(200))
    company_name = Column(String(200))
    style_refs = Column(JSONB, default=list)

    # Output
    status = Column(String(20), default="pending")
    content_html = Column(Text)
    citations = Column(JSONB, default=list)
    error_msg = Column(Text)
    progress_step = Column(Integer, default=0)
    progress_total = Column(Integer, default=3)
    progress_label = Column(String(200))

    # AI model tracking
    model_used = Column(String(100))
    provider_used = Column(String(50))

    # Gamma
    gamma_url = Column(Text)
    gamma_status = Column(String(20))

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User")


class ReferenceArticle(Base):
    __tablename__ = "reference_articles"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Metadata
    title = Column(String(500), nullable=False)
    source_url = Column(Text, nullable=True)
    source_type = Column(String(20), nullable=False, default="paste")
    # source_type: "url" | "paste" | "upload"

    # Content
    content_text = Column(Text)
    content_html = Column(Text)
    char_count = Column(Integer, default=0)

    # Classification
    tax_types = Column(ARRAY(Text), default=list)
    form_type = Column(String(50))
    # form_type: "quick_research" | "full_report" | "analysis" | "press" | "scenario" | "advice" | "other"
    tags = Column(ARRAY(Text), default=list)

    # Auto-classify flag
    auto_classified = Column(Boolean, default=False)

    # Gamma
    gamma_url = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ResearchSession(Base):
    __tablename__ = "research_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    question = Column(Text, nullable=False)
    tax_types = Column(ARRAY(Text))
    time_period = Column(String(100))
    answer_html = Column(Text)
    citations = Column(JSONB, default=list)
    model_used = Column(String(100))
    duration_ms = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="research_sessions")
