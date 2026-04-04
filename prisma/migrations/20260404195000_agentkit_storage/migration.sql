-- CreateTable
CREATE TABLE "AgentKitUsage" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "humanId" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentKitUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentKitNonce" (
    "id" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentKitNonce_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentKitUsage_endpoint_humanId_key" ON "AgentKitUsage"("endpoint", "humanId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentKitNonce_nonce_key" ON "AgentKitNonce"("nonce");
