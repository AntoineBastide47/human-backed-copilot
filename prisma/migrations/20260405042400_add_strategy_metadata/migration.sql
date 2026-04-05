-- Add metadata column missed in previous migration
ALTER TABLE "AgentStrategy" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';
