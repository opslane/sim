CREATE TYPE "public"."chat_type" AS ENUM('mothership', 'copilot');--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD COLUMN "type" "chat_type" DEFAULT 'copilot' NOT NULL;