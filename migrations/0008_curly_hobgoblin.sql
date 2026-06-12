CREATE TABLE `transcript_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_transcript_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`vector` blob NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lesson_transcript_id`) REFERENCES `lesson_transcripts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transcript_emb_chunk_model_idx` ON `transcript_embeddings` (`lesson_transcript_id`,`model`);--> statement-breakpoint
CREATE INDEX `transcript_emb_lesson_idx` ON `transcript_embeddings` (`lesson_id`,`model`);