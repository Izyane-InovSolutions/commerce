-- Fail explicitly on invalid legacy data; resolve it before retrying deployment.
-- No address or financial history is silently removed.
CREATE UNIQUE INDEX addresses_one_default_per_user ON addresses(user_id) WHERE is_default;
ALTER TABLE cart_items ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE cart_items ADD CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0);
ALTER TABLE orders ADD COLUMN checkout_cart_snapshot JSONB;
CREATE TABLE checkout_attempts (
  id UUID NOT NULL PRIMARY KEY,
  user_id UUID NOT NULL,
  key VARCHAR(64) NOT NULL,
  operation VARCHAR(16) NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'IN_PROGRESS',
  order_id UUID,
  response JSONB,
  error_status INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL,
  CONSTRAINT checkout_attempts_status_check CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'REJECTED'))
);
CREATE UNIQUE INDEX checkout_attempts_user_id_key_key ON checkout_attempts(user_id, key);
CREATE UNIQUE INDEX checkout_attempts_order_id_key ON checkout_attempts(order_id);
