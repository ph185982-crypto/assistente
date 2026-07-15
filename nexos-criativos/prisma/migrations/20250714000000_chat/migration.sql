-- CreateTable
CREATE TABLE "Projeto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nicho" TEXT NOT NULL DEFAULT '',
    "publicoAlvo" TEXT NOT NULL DEFAULT '',
    "tomDeVoz" TEXT NOT NULL DEFAULT '',
    "corPrimaria" TEXT NOT NULL DEFAULT '#000000',
    "corSecundaria" TEXT NOT NULL DEFAULT '#ffffff',
    "ctaPadrao" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT,
    "diferenciais" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensagem" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "anexos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "resultados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'enviada',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensagem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Mensagem" ADD CONSTRAINT "Mensagem_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
