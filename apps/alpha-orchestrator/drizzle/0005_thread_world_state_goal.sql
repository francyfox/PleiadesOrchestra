-- Existing checkpoints predate the resumption format that includes `goal` and
-- can't be backfilled with a real one — they're ephemeral (already swept by
-- WORLD_STATE_RETENTION_HOURS), so the safe move is to drop them: the
-- thread's next turn just starts a fresh run instead of resuming a
-- now-incompatible checkpoint.
DELETE FROM `thread_world_state`;
--> statement-breakpoint
ALTER TABLE `thread_world_state` ADD `goal` text NOT NULL;
