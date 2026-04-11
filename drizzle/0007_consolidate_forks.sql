-- Migrate existing session_fork records into session_relation (type: fork)
-- session_fork: session_id = new fork, forked_from_session_id = origin
-- session_relation: from_session_id = origin, to_session_id = new fork
INSERT OR IGNORE INTO session_relation (from_session_id, to_session_id, relation_type)
SELECT forked_from_session_id, session_id, 'fork'
FROM session_fork
WHERE NOT EXISTS (
  SELECT 1 FROM session_relation
  WHERE to_session_id = session_fork.session_id
    AND relation_type = 'fork'
);
