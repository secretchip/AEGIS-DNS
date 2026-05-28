CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `client_auth_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`method` text DEFAULT 'local' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`allow_local_fallback` integer DEFAULT true NOT NULL,
	`default_client_role` text DEFAULT 'viewer' NOT NULL,
	`role_claim` text,
	`role_mapping` text,
	`config` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_auth_configs_client_id_unique` ON `client_auth_configs` (`client_id`);--> statement-breakpoint
CREATE TABLE `client_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`policy_key` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_policy_idx` ON `client_policies` (`client_id`,`policy_key`);--> statement-breakpoint
CREATE TABLE `client_rules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`kind` text NOT NULL,
	`domain` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_rule_idx` ON `client_rules` (`client_id`,`kind`,`domain`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`endpoint_base` text NOT NULL,
	`provisioned_at` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`disabled_at` integer,
	`disabled_reason` text,
	`disabled_note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clients_slug_unique` ON `clients` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`platform_role` text NOT NULL,
	`client_id` integer,
	`client_role` text,
	`status` text DEFAULT 'active' NOT NULL,
	`auth_source` text DEFAULT 'local' NOT NULL,
	`external_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);