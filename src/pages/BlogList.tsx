import { Link } from 'react-router-dom';
import { BLOG_POSTS } from '../data/blog';
import { Calendar, User, Tag, ArrowRight } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';

export default function BlogList() {
  // Simple SEO
  if (typeof document !== 'undefined') {
    document.title = "Blog Dente de Tubarão - Dicas e Tutoriais de Pipa";
    document.querySelector('meta[name="description"]')?.setAttribute('content', "Confira dicas, tutoriais e histórias sobre pipas no Blog da Dente de Tubarão. Segurança, técnicas e muito mais.");
  }

  return (
    <div className="max-w-4xl mx-auto animate-in fade-in duration-500">
      <Breadcrumbs items={[{ label: 'Blog & Dicas' }]} />
      
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-zinc-900 mb-4">Blog Dente de Tubarão</h1>
        <p className="text-zinc-600 text-lg">Dicas, tutoriais e histórias sobre o mundo das pipas.</p>
      </div>

      <div className="grid gap-8">
        {BLOG_POSTS.map((post) => (
          <article key={post.slug} className="bg-white rounded-3xl p-6 sm:p-8 border border-zinc-100 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-wrap gap-2 mb-4">
              {post.tags.map(tag => (
                <span key={tag} className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wide rounded-full">
                  {tag}
                </span>
              ))}
            </div>
            
            <Link to={`/store/blog/${post.slug}`}>
              <h2 className="text-2xl font-bold text-zinc-900 mb-3 hover:text-emerald-600 transition-colors">
                {post.title}
              </h2>
            </Link>
            
            <p className="text-zinc-600 mb-6 leading-relaxed">
              {post.excerpt}
            </p>
            
            <div className="flex items-center justify-between border-t border-zinc-100 pt-6">
              <div className="flex items-center gap-4 text-sm text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Calendar size={16} />
                  {new Date(post.date).toLocaleDateString('pt-BR')}
                </div>
                <div className="flex items-center gap-1.5">
                  <User size={16} />
                  {post.author}
                </div>
              </div>
              
              <Link 
                to={`/store/blog/${post.slug}`}
                className="flex items-center gap-2 text-emerald-600 font-bold text-sm hover:gap-3 transition-all"
              >
                Ler artigo <ArrowRight size={16} />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
