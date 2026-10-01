-- Snap 0059 — WEB-308: absorb the lead thread into the inbox.
-- Converts existing lead_message history into thread/thread_message rows so
-- every past conversation is visible in the unified inbox.
--
-- Idempotent + reversible by design:
--  * deterministic ids ('lead-{leadId}' threads, 'lm-{messageId}' messages)
--    with INSERT OR IGNORE — re-running is a no-op;
--  * lead_message rows are NEVER touched or deleted (rollback = the
--    pre-migration source of truth stays intact; a later cleanup release
--    may drop them).

-- 1. Claim runtime threads that already exist for a lead's email: point
--    them at the lead so history and future replies share one conversation.
UPDATE thread
SET lead_id = (
  SELECT l.id FROM lead l
  WHERE l.organization_id = thread.organization_id
    AND lower(l.email) = thread.client_email
  ORDER BY (CASE WHEN l.status IN ('new','replied') THEN 0 ELSE 1 END), l.updated_at DESC
  LIMIT 1
)
WHERE lead_id IS NULL
  AND EXISTS (
    SELECT 1 FROM lead l
    WHERE l.organization_id = thread.organization_id
      AND lower(l.email) = thread.client_email
  );

-- 2. One deterministic thread per lead that has messages but no thread yet.
INSERT INTO thread (id, organization_id, subject, client_email, lead_id, last_direction, last_activity_at, created_at)
SELECT
  'lead-' || l.id,
  l.organization_id,
  COALESCE(NULLIF(l.event_type, '') || ' inquiry', 'New inquiry'),
  lower(l.email),
  l.id,
  NULL,
  unixepoch(),
  unixepoch()
FROM lead l
WHERE EXISTS (SELECT 1 FROM lead_message lm WHERE lm.lead_id = l.id)
  AND NOT EXISTS (
    SELECT 1 FROM thread t
    WHERE t.organization_id = l.organization_id AND t.client_email = lower(l.email)
  );

-- 3. History: one thread_message per lead_message (deterministic id; the
--    thread is the claimed runtime thread when one exists, else the
--    deterministic one). Bodies stay D1 text (legacy bodies are short — the
--    R2 html path is for new mail only, documented in WEB-307).
INSERT OR IGNORE INTO thread_message
  (id, thread_id, organization_id, direction, rfc_message_id, from_addr, subject, text_preview, status, created_at)
SELECT
  'lm-' || lm.id,
  COALESCE(
    (SELECT t.id FROM thread t
     WHERE t.organization_id = lm.organization_id AND t.client_email = lower(l.email)
     ORDER BY (t.lead_id IS NOT NULL) DESC, t.last_activity_at DESC
     LIMIT 1),
    'lead-' || l.id
  ),
  lm.organization_id,
  lm.direction,
  lm.provider_id,
  CASE WHEN lm.direction = 'in' THEN lower(l.email) ELSE '' END,
  COALESCE(lm.subject, ''),
  substr(lm.body, 1, 8000),
  CASE WHEN lm.direction = 'in' THEN 'received' ELSE 'sent' END,
  lm.created_at
FROM lead_message lm
JOIN lead l ON l.id = lm.lead_id;

-- 4. Refresh activity pointers on every affected thread.
UPDATE thread
SET last_activity_at = COALESCE(
    (SELECT max(tm.created_at) FROM thread_message tm WHERE tm.thread_id = thread.id),
    last_activity_at
  ),
  last_direction = (
    SELECT tm.direction FROM thread_message tm
    WHERE tm.thread_id = thread.id
    ORDER BY tm.created_at DESC, tm.id DESC LIMIT 1
  )
WHERE EXISTS (SELECT 1 FROM thread_message tm WHERE tm.thread_id = thread.id);
