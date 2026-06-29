CREATE TABLE `blog_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`body_markdown` text DEFAULT '' NOT NULL,
	`author` text DEFAULT 'Jason Young, DC' NOT NULL,
	`author_credentials` text,
	`tags` text DEFAULT '[]',
	`status` text DEFAULT 'draft' NOT NULL,
	`hero_image` text,
	`seo_description` text,
	`model` text,
	`published_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `blog_posts_slug_idx` ON `blog_posts` (`slug`);--> statement-breakpoint
CREATE INDEX `blog_posts_status_idx` ON `blog_posts` (`status`,`published_at`);