ALTER TABLE `certificates` ADD `cert_number` text;--> statement-breakpoint
CREATE UNIQUE INDEX `certificates_cert_number_unique` ON `certificates` (`cert_number`);