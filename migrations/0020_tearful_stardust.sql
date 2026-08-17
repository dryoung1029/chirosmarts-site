CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text DEFAULT 'sale' NOT NULL,
	`source` text DEFAULT 'stripe' NOT NULL,
	`channel` text DEFAULT 'direct' NOT NULL,
	`user_id` text,
	`clinic_id` text,
	`course_id` text,
	`sku_slug` text,
	`sku_label` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_cents` integer DEFAULT 0 NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_payment_intent_id` text,
	`reverses_sale_id` text,
	`note` text,
	`occurred_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sales_occurred_idx` ON `sales` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `sales_course_idx` ON `sales` (`course_id`);--> statement-breakpoint
CREATE INDEX `sales_pi_idx` ON `sales` (`stripe_payment_intent_id`);