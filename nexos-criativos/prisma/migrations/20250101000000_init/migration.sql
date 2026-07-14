-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "nicho" TEXT NOT NULL,
    "publicoAlvo" TEXT NOT NULL,
    "tomDeVoz" TEXT NOT NULL,
    "corPrimaria" TEXT NOT NULL,
    "corSecundaria" TEXT NOT NULL,
    "fonteTitulo" TEXT NOT NULL DEFAULT 'DM Sans',
    "ctaPadrao" TEXT NOT NULL,
    "whatsapp" TEXT,
    "logoPath" TEXT,
    "diferenciais" TEXT NOT NULL,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtivoVisual" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "descricao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtivoVisual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCriativo" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "objetivo" TEXT NOT NULL,
    "briefing" TEXT,
    "ativosUsados" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'processando',
    "erroMsg" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCriativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conceito" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "angulo" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "legenda" TEXT NOT NULL,
    "cta" TEXT,
    "promptImg" TEXT NOT NULL,

    CONSTRAINT "Conceito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Variacao" (
    "id" TEXT NOT NULL,
    "conceitoId" TEXT NOT NULL,
    "pathBase" TEXT NOT NULL,
    "path1x1" TEXT,
    "path4x5" TEXT,
    "path9x16" TEXT,
    "aprovada" BOOLEAN NOT NULL DEFAULT false,
    "feedback" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Variacao_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AtivoVisual" ADD CONSTRAINT "AtivoVisual_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCriativo" ADD CONSTRAINT "JobCriativo_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conceito" ADD CONSTRAINT "Conceito_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobCriativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Variacao" ADD CONSTRAINT "Variacao_conceitoId_fkey" FOREIGN KEY ("conceitoId") REFERENCES "Conceito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
