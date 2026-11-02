-- Stage 7 follow-up to 20261008000000_transactional_shopping (left unchanged).
--
-- Preflight: report every offending row and stop. Nothing here deletes or
-- rewrites history; repair the reported rows deliberately, then redeploy. See
-- docs/backend/transactional-shopping-verification.md#forward-repair.
DO $$
DECLARE
  offending TEXT;
BEGIN
  SELECT string_agg(user_id::TEXT || ' (' || ids || ')', '; ' ORDER BY user_id)
    INTO offending
    FROM (
      SELECT user_id, string_agg(id::TEXT, ', ' ORDER BY id) AS ids
        FROM addresses
       WHERE is_default
       GROUP BY user_id
      HAVING count(*) > 1
    ) duplicates;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'Stage 7 preflight: users with more than one default address: %', offending;
  END IF;

  SELECT string_agg(id::TEXT, ', ' ORDER BY id) INTO offending
    FROM cart_items
   WHERE quantity <= 0 OR revision < 0;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'Stage 7 preflight: cart_items with non-positive quantity or negative revision: %', offending;
  END IF;

  SELECT string_agg(a.id::TEXT, ', ' ORDER BY a.id) INTO offending
    FROM checkout_attempts a
   WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id);
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'Stage 7 preflight: checkout_attempts referencing missing users: %', offending;
  END IF;

  SELECT string_agg(a.id::TEXT, ', ' ORDER BY a.id) INTO offending
    FROM checkout_attempts a
    LEFT JOIN orders o ON o.id = a.order_id
   WHERE a.order_id IS NOT NULL AND (o.id IS NULL OR o.user_id <> a.user_id);
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'Stage 7 preflight: checkout_attempts referencing missing or foreign orders: %', offending;
  END IF;

  SELECT string_agg(id::TEXT, ', ' ORDER BY id) INTO offending
    FROM checkout_attempts
   WHERE operation NOT IN ('cart', 'buy-now')
      OR (status = 'COMPLETED' AND (response IS NULL OR order_id IS NULL))
      OR (status = 'REJECTED' AND (response IS NULL OR error_status IS NULL OR error_status NOT BETWEEN 400 AND 599));
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'Stage 7 preflight: checkout_attempts with an invalid recorded outcome: %', offending;
  END IF;
END $$;

-- Receipt metadata. Existing rows keep NULL fingerprint metadata: they were
-- hashed without a key and are treated as legacy receipts (documented 409).
ALTER TABLE checkout_attempts
  ADD COLUMN fingerprint_key_id VARCHAR(32),
  ADD COLUMN fingerprint_version SMALLINT,
  ADD COLUMN stage VARCHAR(24) NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN owner_token UUID,
  ADD COLUMN lease_expires_at TIMESTAMP(3),
  ADD COLUMN completed_at TIMESTAMP(3);

-- A replay must return the first response byte for byte. jsonb normalizes key
-- order; json keeps the text exactly as written. Existing values convert as-is.
ALTER TABLE checkout_attempts
  ALTER COLUMN response TYPE JSON USING response::TEXT::JSON;

ALTER TABLE checkout_attempts
  DROP CONSTRAINT checkout_attempts_status_check,
  ADD CONSTRAINT checkout_attempts_status_check
    CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'REJECTED', 'BLOCKED')),
  ADD CONSTRAINT checkout_attempts_stage_check
    CHECK (stage IN ('RECEIVED', 'ORDER_CREATED', 'PAYMENT_STARTED', 'FINISHED')),
  ADD CONSTRAINT checkout_attempts_operation_check
    CHECK (operation IN ('cart', 'buy-now')),
  ADD CONSTRAINT checkout_attempts_fingerprint_metadata_check
    CHECK ((fingerprint_key_id IS NULL) = (fingerprint_version IS NULL)
      AND (fingerprint_version IS NULL OR fingerprint_version > 0)),
  ADD CONSTRAINT checkout_attempts_lease_check
    CHECK ((owner_token IS NULL) = (lease_expires_at IS NULL)),
  ADD CONSTRAINT checkout_attempts_outcome_check
    CHECK (
      (status = 'IN_PROGRESS')
      OR (status = 'BLOCKED' AND order_id IS NOT NULL)
      OR (status = 'COMPLETED' AND response IS NOT NULL AND order_id IS NOT NULL)
      -- error_status IS NOT NULL is required: NULL BETWEEN ... is NULL, and a
      -- CHECK accepts NULL, so without it a REJECTED row could omit its status.
      OR (status = 'REJECTED' AND response IS NOT NULL AND error_status IS NOT NULL
          AND error_status BETWEEN 400 AND 599)
    ),
  ADD CONSTRAINT checkout_attempts_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT checkout_attempts_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE cart_items
  ADD CONSTRAINT cart_items_revision_nonnegative CHECK (revision >= 0);
