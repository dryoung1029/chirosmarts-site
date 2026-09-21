CREATE TABLE `page_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`channel` text NOT NULL,
	`referrer_host` text,
	`utm_source` text,
	`utm_medium` text,
	`utm_campaign` text,
	`country` text,
	`device` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `page_metrics_time_idx` ON `page_metrics` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `page_metrics_path_idx` ON `page_metrics` (`path`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `page_metrics_channel_idx` ON `page_metrics` (`channel`,`occurred_at`);