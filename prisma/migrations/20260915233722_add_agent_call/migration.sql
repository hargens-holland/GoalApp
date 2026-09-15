-- CreateTable
CREATE TABLE "AgentCall" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentCall_createdAt_idx" ON "AgentCall"("createdAt");

-- CreateIndex
CREATE INDEX "AgentCall_label_createdAt_idx" ON "AgentCall"("label", "createdAt");

-- CreateIndex
CREATE INDEX "AgentCall_userId_createdAt_idx" ON "AgentCall"("userId", "createdAt");
