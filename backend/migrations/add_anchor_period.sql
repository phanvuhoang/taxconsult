-- taxconsult DB: thêm anchor_from, anchor_to vào priority_docs
ALTER TABLE priority_docs
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;

COMMENT ON COLUMN priority_docs.anchor_from IS 'Anchor có hiệu lực từ ngày (NULL = không giới hạn)';
COMMENT ON COLUMN priority_docs.anchor_to   IS 'Anchor hết hiệu lực ngày (NULL = đang có hiệu lực)';
