import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const effata = await prisma.cliente.upsert({
    where: { id: 'effata-seed' },
    update: {},
    create: {
      id: 'effata-seed',
      nome: 'Effata Moda',
      nicho: 'moda feminina',
      publicoAlvo: 'Mulheres 20-40 anos, Goiânia e região, renda C/B, compram no Instagram e Shopee',
      tomDeVoz: 'jovem, próximo, sem formalidade, como uma amiga que entende de moda',
      corPrimaria: '#C8A96E',
      corSecundaria: '#1A1A1A',
      fonteTitulo: 'DM Sans',
      ctaPadrao: 'Chama no WhatsApp e garante o seu',
      whatsapp: '556299999001',
      diferenciais: 'Roupas exclusivas\nPreços acessíveis\nEntrega rápida em Goiânia\nTamanhos P ao GG',
      observacoes: null,
    },
  })

  const showman = await prisma.cliente.upsert({
    where: { id: 'showman-seed' },
    update: {},
    create: {
      id: 'showman-seed',
      nome: 'Show Man Barbearia',
      nicho: 'barbearia',
      publicoAlvo: 'Homens 18-40 anos, Goiânia, querem estilo e agilidade no serviço',
      tomDeVoz: 'direto, masculino, informal, sem rodeios',
      corPrimaria: '#2D2D2D',
      corSecundaria: '#C8A96E',
      fonteTitulo: 'DM Sans',
      ctaPadrao: 'Agenda agora pelo WhatsApp',
      whatsapp: '556299999002',
      diferenciais: 'Corte + barba em 40 minutos\nAgendamento online sem fila\nAmbiente climatizado\nBarbeiros certificados',
      observacoes: null,
    },
  })

  console.log('Seed concluído:', { effata: effata.nome, showman: showman.nome })
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
