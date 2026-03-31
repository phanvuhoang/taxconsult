-- dbvntax DB (postgres): thêm anchor_from, anchor_to vào documents
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS anchor_from DATE,
  ADD COLUMN IF NOT EXISTS anchor_to   DATE;

COMMENT ON COLUMN documents.anchor_from IS 'Anchor có hiệu lực từ ngày (NULL = không giới hạn)';
COMMENT ON COLUMN documents.anchor_to   IS 'Anchor hết hiệu lực ngày (NULL = đang có hiệu lực)';
