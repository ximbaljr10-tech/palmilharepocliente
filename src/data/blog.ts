export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  author: string;
  image_url?: string;
  tags: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "como-escolher-linha-pipa",
    title: "Como escolher a linha ideal para sua pipa",
    excerpt: "Descubra qual a melhor espessura e tipo de linha para cada situação de vento e estilo de pipa.",
    date: "2026-03-15",
    author: "Equipe Dente de Tubarão",
    tags: ["Dicas", "Iniciante"],
    content: `
      <h2>Entendendo as numerações</h2>
      <p>A escolha da linha correta é fundamental para garantir o melhor desempenho da sua pipa no alto. As numerações mais comuns (Fio 10, Fio 4, Fio 24) indicam a espessura e a resistência.</p>
      
      <h3>Para pipas pequenas (até 60cm)</h3>
      <p>Recomendamos linhas mais finas, como a Fio 10. Elas oferecem menos resistência ao vento e deixam a pipa mais ágil.</p>

      <h3>Para pipas médias e grandes</h3>
      <p>Pipas acima de 70cm exigem linhas mais resistentes, como Fio 4 ou Fio 24, para suportar a força do vento sem arrebentar.</p>

      <h2>O fator vento</h2>
      <p>Em dias de vento muito forte, uma linha muito fina pode não aguentar a pressão. Já em dias de vento fraco, uma linha grossa vai deixar a pipa "pesada" e difícil de subir.</p>

      <h2>Segurança em primeiro lugar</h2>
      <p>Sempre solte pipa em locais abertos, longe de redes elétricas e rodovias. A segurança deve ser sempre a prioridade número um de todo pipeiro.</p>
    `
  },
  {
    slug: "seguranca-pipa-locais",
    title: "Onde soltar pipa com segurança: Guia Completo",
    excerpt: "A prática de soltar pipa é divertida, mas exige responsabilidade. Veja os melhores locais.",
    date: "2026-03-20",
    author: "Equipe Dente de Tubarão",
    tags: ["Segurança", "Educativo"],
    content: `
      <h2>Longe da Rede Elétrica</h2>
      <p>A regra de ouro: nunca solte pipa perto de fios de alta tensão ou postes. O risco de choque elétrico é real e pode ser fatal. Além disso, tentar recuperar uma pipa enroscada nos fios é extremamente perigoso.</p>

      <h2>Parques e Praças Abertas</h2>
      <p>Busque locais amplos, como parques, praças grandes, campos de futebol ou praias (onde permitido). Esses locais oferecem vento limpo e espaço para correr sem riscos.</p>

      <h2>Cuidado com Motociclistas e Pedestres</h2>
      <p>Evite soltar pipa perto de ruas, avenidas e ciclovias. As linhas podem ser invisíveis para quem passa em velocidade.</p>

      <h2>Respeito ao Próximo</h2>
      <p>A diversão de um não pode ser o perigo do outro. Pratique o esporte com consciência e ajude a manter a imagem positiva da pipa.</p>
    `
  },
  {
    slug: "historia-das-pipas",
    title: "A História das Pipas: De ferramenta militar a esporte",
    excerpt: "Você sabia que as pipas já foram usadas em guerras e experimentos científicos?",
    date: "2026-03-28",
    author: "Equipe Dente de Tubarão",
    tags: ["Curiosidades", "História"],
    content: `
      <h2>Origem Milenar</h2>
      <p>As primeiras pipas surgiram na China antiga, por volta de 1000 a.C. Inicialmente, eram usadas para sinalização militar e medição de distâncias em terrenos difíceis.</p>

      <h2>Experimentos Científicos</h2>
      <p>Benjamin Franklin usou uma pipa em seu famoso experimento para provar que os raios eram eletricidade. Santos Dumont também usou pipas para testar conceitos aerodinâmicos.</p>

      <h2>No Brasil</h2>
      <p>Trazidas pelos portugueses, as pipas se tornaram parte da cultura popular brasileira, ganhando nomes diferentes em cada região: papagaio, arraia, pepeta, pandorga, entre outros.</p>

      <h2>O Esporte Hoje</h2>
      <p>Hoje, a pipa evoluiu para um esporte organizado, com campeonatos, regras e equipamentos de alta performance, como as linhas que vendemos aqui na Dente de Tubarão.</p>
    `
  }
];
