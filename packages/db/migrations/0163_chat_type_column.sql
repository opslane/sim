DO $$ BEGIN
 CREATE TYPE "public"."chat_type" AS ENUM('mothership', 'copilot');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "copilot_chats" ADD COLUMN "type" "public"."chat_type" DEFAULT 'copilot' NOT NULL;
