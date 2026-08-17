-- Raise the playback-speed cap to 2x for all courses (was 1.5x).
-- Seat time credits content-minutes regardless of speed; the cap is the
-- per-course "max watch speed" knob. Run:
--   npx wrangler d1 execute chirosmarts --remote --file=./scripts/set-playback-2x.sql
UPDATE courses SET max_playback_rate = 2.0 WHERE max_playback_rate < 2.0;
