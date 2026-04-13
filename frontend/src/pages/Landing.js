import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Activity, DollarSign, Stethoscope, ChevronRight, Layers } from 'lucide-react';
import { Button } from '../components/ui/button';

const AxiomInsole3D = () => (
  <svg viewBox="0 0 200 500" className="w-full h-[120%] object-contain" style={{ filter: 'drop-shadow(0 20px 30px rgba(255, 77, 41, 0.2))' }}>
    <defs>
      <linearGradient id="insoleGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#1E2024" />
        <stop offset="100%" stopColor="#13151A" />
      </linearGradient>
      <filter id="glow">
        <feGaussianBlur stdDeviation="8" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    {/* Base Insole Shape */}
    <path 
      d="M 100,10 C 60,10 30,50 30,120 C 30,190 60,250 60,330 C 60,400 70,480 100,480 C 130,480 140,400 140,330 C 140,250 170,190 170,120 C 170,50 140,10 100,10 Z" 
      fill="url(#insoleGradient)" 
      stroke="#FF4D29" 
      strokeWidth="2" 
    />
    
    {/* Inner Contours (Arch Support) */}
    <path 
      d="M 100,20 C 70,20 45,60 45,120 C 45,180 70,250 70,330 C 70,390 80,460 100,460 C 120,460 130,390 130,330 C 130,250 155,180 155,120 C 155,60 130,20 100,20 Z" 
      fill="none" 
      stroke="#2A2D35" 
      strokeWidth="1" 
      strokeDasharray="4 4"
    />
    
    {/* Pressure Points with Glow */}
    {/* Heel */}
    <circle cx="100" cy="410" r="30" fill="#FF4D29" opacity="0.3" filter="url(#glow)" />
    <circle cx="100" cy="410" r="15" fill="#FF4D29" opacity="0.6" />
    <circle cx="100" cy="410" r="4" fill="#FFFFFF" />
    
    {/* Metatarsal Heads */}
    <circle cx="110" cy="120" r="25" fill="#FFB300" opacity="0.3" filter="url(#glow)" />
    <circle cx="110" cy="120" r="10" fill="#FFB300" opacity="0.7" />
    <circle cx="110" cy="120" r="3" fill="#FFFFFF" />
    
    <circle cx="65" cy="140" r="15" fill="#10B981" opacity="0.3" filter="url(#glow)" />
    <circle cx="65" cy="140" r="6" fill="#10B981" opacity="0.8" />
    <circle cx="65" cy="140" r="2" fill="#FFFFFF" />
    
    {/* Big Toe */}
    <circle cx="120" cy="50" r="15" fill="#EF4444" opacity="0.4" filter="url(#glow)" />
    <circle cx="120" cy="50" r="8" fill="#EF4444" opacity="0.8" />
    <circle cx="120" cy="50" r="3" fill="#FFFFFF" />
    
    {/* Connections / Kinematic Lines */}
    <path d="M 100,410 L 110,120 L 120,50" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.4" strokeDasharray="2 4" />
    <path d="M 110,120 L 65,140" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.4" strokeDasharray="2 4" />
    <path d="M 100,410 L 65,140" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.2" strokeDasharray="2 4" />
  </svg>
);

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

        {/* 3D Element Area (Animated Insole) */}
        <div className="relative z-10 lg:w-1/2 w-full h-[400px] lg:h-[600px] mt-12 lg:mt-0 flex items-center justify-center pointer-events-none perspective-1000">
           {/* Glow Effect */}
           <motion.div 
             animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
             transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
             className="absolute w-[300px] h-[300px] bg-primary/30 blur-[120px] rounded-full"
           />
           
           {/* Floating & Rotating Insole */}
           <motion.div
             animate={{ 
               y: [-20, 20, -20],
               rotateY: [0, 10, -10, 0],
               rotateX: [5, -5, 5]
             }}
             transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
             className="relative w-full max-w-sm h-full flex items-center justify-center"
           >
             <AxiomInsole3D />
             
             {/* Tech Overlay lines */}
             <motion.div 
               animate={{ opacity: [0.2, 0.8, 0.2] }}
               transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
               className="absolute inset-0 border border-primary/30 rounded-3xl"
             />
             
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