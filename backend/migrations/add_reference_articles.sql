-- Migration: Add reference_articles table
-- Run manually on server: psql $DATABASE_URL -f add_reference_articles.sql

CREATE TABLE IF NOT EXISTS reference_articles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    source_url TEXT,
    source_type VARCHAR(20) NOT NULL DEFAULT 'paste',
    content_text TEXT,
    content_html TEXT,
    char_count INTEGER DEFAULT 0,
    tax_types TEXT[] DEFAULT '{}',
    form_type VARCHAR(50),
    tags TEXT[] DEFAULT '{}',
    auto_classified BOOLEAN DEFAULT FALSE,
    gamma_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ref_articles_user ON reference_articles(user_id);
CREATE INDEX IF NOT EXISTS idx_ref_articles_tax_types ON reference_articles USING GIN(tax_types);
CREATE INDEX IF NOT EXISTS idx_ref_articles_form_type ON reference_articles(form_type);
