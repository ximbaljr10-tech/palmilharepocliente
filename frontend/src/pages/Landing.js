import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Activity, DollarSign, Layers } from 'lucide-react';
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
                Seja um Parceiro
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 md:pt-40 md:pb-32 container mx-auto px-6 md:px-12 flex flex-col lg:flex-row items-center">
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1756093035138-7135b07084b5?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1NzZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGFyY2hpdGVjdHVyYWwlMjBkYXJrfGVufDB8fHx8MTc3NjExNTIwOXww&ixlib=rb-4.1.0&q=85')", backgroundSize: 'cover', backgroundPosition: 'center' }} />
        
        <div className="relative z-10 lg:w-1/2 max-w-2xl">
          <motion.div initial="hidden" animate="show" variants={container}>
            <motion.div variants={item} className="inline-flex items-center gap-2 px-3 py-1 border border-border bg-secondary/50 text-xs font-bold uppercase tracking-[0.2em] mb-6 text-primary">
              <Activity className="w-4 h-4" /> Engenharia Biomecânica Aplicada
            </motion.div>
            <motion.h1 variants={item} className="text-5xl sm:text-6xl md:text-7xl font-heading font-medium tracking-tighter leading-[1.1] mb-6">
              A precisão da <span className="text-primary">pisada.</span><br />
              O futuro do seu atendimento.
            </motion.h1>
            <motion.p variants={item} className="text-lg md:text-xl text-muted-foreground mb-10 max-w-xl leading-relaxed">
              Transforme avaliações clínicas em órteses plantares (palmilhas) de alta tecnologia. Você realiza o diagnóstico, nós cuidamos da manufatura 3D e entrega. Adicione uma nova fonte de receita sem investir em maquinário.
            </motion.p>
            <motion.div variants={item} className="flex flex-col sm:flex-row gap-4">
              <Link to="/register" data-testid="hero-register">
                <Button size="lg" className="rounded-none w-full sm:w-auto h-14 px-8 bg-primary hover:bg-primary/90 text-white text-lg transition-transform hover:-translate-y-[2px]">
                  Começar Agora <ArrowRight className="ml-2" />
                </Button>
              </Link>
              <Button size="lg" variant="outline" className="rounded-none w-full sm:w-auto h-14 px-8 border-border hover:bg-secondary/50 transition-transform hover:-translate-y-[2px]">
                Entenda o Modelo
              </Button>
            </motion.div>
          </motion.div>
        </div>

        {/* 3D Element Area (Animated Custom Insole) */}
        <div className="relative z-10 lg:w-1/2 w-full h-[400px] lg:h-[600px] mt-12 lg:mt-0 flex items-center justify-center pointer-events-none perspective-1000">
           {/* Glow Effect */}
           <motion.div 
             animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
             transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
             className="absolute w-[300px] h-[300px] bg-primary/40 blur-[120px] rounded-full"
           />
           
           {/* Floating & Rotating Insole Image */}
           <motion.div
             animate={{ 
               y: [-20, 20, -20],
               rotateY: [0, 10, -10, 0],
               rotateX: [5, -5, 5]
             }}
             transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
             className="relative w-full max-w-lg flex items-center justify-center"
           >
             <img 
               src="/insole_custom.png" 
               alt="Axiom Biomechanics 3D Insole"
               className="w-[120%] h-auto object-contain drop-shadow-[0_20px_30px_rgba(255,77,41,0.4)]"
             />
             
             {/* Tech Overlay lines */}
             <motion.div 
               animate={{ opacity: [0.2, 0.8, 0.2] }}
               transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
               className="absolute inset-0 border border-primary/30 rounded-3xl"
             />
             
             {/* Abstract floating points representing biomechanical analysis */}
             <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} className="absolute top-[20%] left-[30%] w-3 h-3 bg-white rounded-full shadow-[0_0_15px_#FF4D29]" />
             <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 2.5, repeat: Infinity, delay: 0.5 }} className="absolute bottom-[30%] right-[25%] w-3 h-3 bg-white rounded-full shadow-[0_0_15px_#FF4D29]" />
             <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.8, repeat: Infinity, delay: 1 }} className="absolute top-[50%] left-[60%] w-2 h-2 bg-primary rounded-full shadow-[0_0_15px_#FF4D29]" />
             
           </motion.div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="py-24 bg-secondary/20 border-t border-border">
        <div className="container mx-auto px-6 md:px-12">
          <div className="mb-16">
            <h2 className="text-3xl sm:text-4xl font-heading font-medium mb-4">Um modelo de negócios inteligente.</h2>
            <p className="text-muted-foreground max-w-2xl text-lg">Nossa plataforma conecta o seu conhecimento clínico a um laboratório de ponta. Desenvolvemos palmilhas personalizadas baseadas no seu projeto biomecânico.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-8 p-8 md:p-12 border border-border bg-card relative overflow-hidden group">
              <div className="absolute inset-0 opacity-10 transition-opacity group-hover:opacity-20" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1770219287080-9c73532fa878?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2NzZ8MHwxfHNlYXJjaHwyfHxwaHlzaW90aGVyYXBpc3QlMjBjb25zdWx0aW5nJTIwcGF0aWVudHxlbnwwfHx8fDE3NzYxMTUxODl8MA&ixlib=rb-4.1.0&q=85')", backgroundSize: 'cover' }} />
              <div className="relative z-10">
                <Layers className="w-12 h-12 text-primary mb-6" />
                <h3 className="text-2xl font-heading mb-3">Manufatura Terceirizada de Elite</h3>
                <p className="text-muted-foreground text-lg max-w-md">Você não precisa investir em fresadoras ou impressoras 3D. Faça o molde, preencha os dados de pressão plantar e nós produzimos a órtese perfeita em nosso laboratório em SP.</p>
              </div>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card relative overflow-hidden">
              <DollarSign className="w-12 h-12 text-primary mb-6" />
              <h3 className="text-2xl font-heading mb-3">Monetização Direta</h3>
              <p className="text-muted-foreground">O paciente paga o valor final (comissionado) direto na plataforma. O repasse é automático para você e para a confecção.</p>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card hover:border-primary/50 transition-colors">
              <div className="text-4xl font-heading text-primary mb-4">01</div>
              <h3 className="text-xl font-heading mb-2">Consulta & Molde</h3>
              <p className="text-muted-foreground text-sm">Realize a baropodometria e avaliação física no seu consultório, como você já faz.</p>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card hover:border-primary/50 transition-colors">
              <div className="text-4xl font-heading text-primary mb-4">02</div>
              <h3 className="text-xl font-heading mb-2">Plataforma Axiom</h3>
              <p className="text-muted-foreground text-sm">Insira os parâmetros biomecânicos e envie o miniprojeto da palmilha pelo nosso sistema.</p>
            </div>
            
            <div className="md:col-span-4 p-8 border border-border bg-card hover:border-primary/50 transition-colors">
              <div className="text-4xl font-heading text-primary mb-4">03</div>
              <h3 className="text-xl font-heading mb-2">Produção & Entrega</h3>
              <p className="text-muted-foreground text-sm">A palmilha é fresada com precisão milimétrica e entregue pronta para o uso do paciente.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 container mx-auto px-6 md:px-12 text-center">
        <h2 className="text-4xl md:text-6xl font-heading font-medium mb-8">Eleve o padrão do seu tratamento.</h2>
        <Link to="/register" data-testid="footer-cta">
          <Button size="lg" className="rounded-none h-16 px-10 bg-primary hover:bg-primary/90 text-white text-xl transition-transform hover:-translate-y-[2px]">
            Criar Minha Conta Profissional
          </Button>
        </Link>
      </section>
      
      <footer className="border-t border-border py-8 text-center text-muted-foreground text-sm">
        <p>&copy; 2026 Axiom Biomechanics. Desenvolvido para performance ortopédica.</p>
      </footer>
    </div>
  );
}