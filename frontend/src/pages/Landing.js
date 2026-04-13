import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Activity, DollarSign, Stethoscope, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';

export default function Landing() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 }
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Navbar */}
      <nav className="fixed top-0 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl z-50">
        <div className="container mx-auto px-6 md:px-12 flex h-16 items-center justify-between">
          <div className="font-heading font-bold text-2xl tracking-tighter text-primary">AXIOM</div>
          <div className="flex gap-4">
            <Link to="/login" data-testid="nav-login">
              <Button variant="ghost" className="rounded-none hover:bg-secondary">Login</Button>
            </Link>
            <Link to="/register" data-testid="nav-register">
              <Button className="rounded-none bg-primary hover:bg-primary/90 text-white shadow-none transition-transform hover:-translate-y-[2px]">
                Prescreva Axiom
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 md:pt-48 md:pb-32 container mx-auto px-6 md:px-12">
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1756093035138-7135b07084b5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGFyY2hpdGVjdHVyYWwlMjBkYXJrfGVufDB8fHx8MTc3NjExNTIwOXww&ixlib=rb-4.1.0&q=85')", backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="relative z-10 max-w-4xl">
          <motion.div initial="hidden" animate="show" variants={container}>
            <motion.div variants={item} className="inline-flex items-center gap-2 px-3 py-1 border border-border bg-secondary/50 text-xs font-bold uppercase tracking-[0.2em] mb-6 text-primary">
              <Activity className="w-4 h-4" /> Para Ortopedistas e Fisioterapeutas
            </motion.div>
            <motion.h1 variants={item} className="text-5xl sm:text-6xl md:text-7xl font-heading font-medium tracking-tighter leading-[1.1] mb-6">
              A precisão da <span className="text-primary">biomecânica.</span><br />
              O futuro da sua clínica.
            </motion.h1>
            <motion.p variants={item} className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl leading-relaxed">
              Crie projetos de palmilhas personalizadas em minutos. Aumente a receita do seu consultório sem investimento inicial, entregando tecnologia de ponta para seus pacientes.
            </motion.p>
            <motion.div variants={item} className="flex flex-col sm:flex-row gap-4">
              <Link to="/register" data-testid="hero-register">
                <Button size="lg" className="rounded-none w-full sm:w-auto h-14 px-8 bg-primary hover:bg-primary/90 text-white text-lg transition-transform hover:-translate-y-[2px]">
                  Começar Agora <ArrowRight className="ml-2" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="rounded-none w-full sm:w-auto h-14 px-8 border-border hover:bg-secondary/50 transition-transform hover:-translate-y-[2px]">
                Entenda o Processo
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="py-24 bg-secondary/20 border-t border-border">
        <div className="container mx-auto px-6 md:px-12">
          <div className="mb-16">
            <h2 className="text-3xl sm:text-4xl font-heading font-medium mb-4">Desenvolvido por especialistas.</h2>
            <p className="text-muted-foreground max-w-2xl text-lg">Um sistema inteligente que transforma dados de baropodometria e avaliações clínicas em órteses perfeitas.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8 p-8 md:p-12 border border-border bg-card relative overflow-hidden group">
              <div className="absolute inset-0 opacity-10 transition-opacity group-hover:opacity-20" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1770219287080-9c73532fa878?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwyfHxwaHlzaW90aGVyYXBpc3QlMjBjb25zdWx0aW5nJTIwcGF0aWVudHxlbnwwfHx8fDE3NzYxMTUxODl8MA&ixlib=rb-4.1.0&q=85')", backgroundSize: 'cover' }} />
              <div className="relative z-10">
                <Stethoscope className="w-12 h-12 text-primary mb-6" />
                <h3 className="text-2xl font-heading mb-3">Sem Investimento Inicial</h3>
                <p className="text-muted-foreground text-lg max-w-md">Você não precisa comprar equipamentos caros de manufatura. Foque no diagnóstico, nós cuidamos da produção.</p>
              </div>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card relative overflow-hidden">
              <DollarSign className="w-12 h-12 text-primary mb-6" />
              <h3 className="text-2xl font-heading mb-3">Nova Linha de Receita</h3>
              <p className="text-muted-foreground">Em vez de apenas encaminhar pacientes, adicione valor e receba por cada projeto finalizado.</p>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card">
              <div className="text-4xl font-heading text-primary mb-4">01</div>
              <h3 className="text-xl font-heading mb-2">Avaliação</h3>
              <p className="text-muted-foreground text-sm">Colete dados do paciente durante a consulta normal.</p>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card">
              <div className="text-4xl font-heading text-primary mb-4">02</div>
              <h3 className="text-xl font-heading mb-2">Plataforma Axiom</h3>
              <p className="text-muted-foreground text-sm">Insira o tamanho, tipo de pisada e anexe os exames no sistema.</p>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card">
              <div className="text-4xl font-heading text-primary mb-4">03</div>
              <h3 className="text-xl font-heading mb-2">Entrega</h3>
              <p className="text-muted-foreground text-sm">Produzimos com precisão e enviamos. O paciente paga via Pix e você lucra.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 container mx-auto px-6 md:px-12 text-center">
        <h2 className="text-4xl md:text-6xl font-heading font-medium mb-8">Eleve o padrão do seu atendimento.</h2>
        <Link to="/register" data-testid="footer-cta">
          <Button size="lg" className="rounded-none h-16 px-10 bg-primary hover:bg-primary/90 text-white text-xl transition-transform hover:-translate-y-[2px]">
            Criar Minha Conta Profissional
          </Button>
        </Link>
      </section>
      
      <footer className="border-t border-border py-8 text-center text-muted-foreground text-sm">
        <p>&copy; 2026 Axiom Biomechanics. Desenvolvido para performance.</p>
      </footer>
    </div>
  );
}