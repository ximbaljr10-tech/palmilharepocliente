import { useParams, useNavigate } from 'react-router-dom';
import { BLOG_POSTS } from '../data/blog';
import { Calendar, User, ArrowLeft } from 'lucide-react';
import Breadcrumbs from '../components/Breadcrumbs';
import DOMPurify from 'dompurify';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const post = BLOG_POSTS.find(p => p.slug === slug);

  // Simple SEO
  if (post && typeof document !== 'undefined') {
    document.title = `${post.title} - Blog Dente de Tubarão`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', post.excerpt);
  }

  if (!post) {
    return (
      <div className="text-center py-20">
        <h2 className="text-2xl font-bold text-zinc-900 mb-4">Artigo não encontrado</h2>
        <button onClick={() => navigate('/store/blog')} className="text-emerald-600 font-bold hover:underline">
          Voltar para o blog
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-500">
      <Breadcrumbs items={[
        { label: 'Blog', path: '/store/blog' },
        { label: post.title }
      ]} />

      <article className="bg-white rounded-3xl border border-zinc-100 overflow-hidden">
        <div className="p-6 sm:p-10">
          <div className="flex flex-wrap gap-2 mb-6">
            {post.tags.map(tag => (
              <span key={tag} className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wide rounded-full">
                {tag}
              </span>
            ))}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-zinc-900 mb-6 leading-tight">
            {post.title}
          </h1>

          <div className="flex items-center gap-6 text-sm text-zinc-500 mb-8 pb-8 border-b border-zinc-100">
            <div className="flex items-center gap-2">
              <Calendar size={18} />
              {new Date(post.date).toLocaleDateString('pt-BR')}
            </div>
            <div className="flex items-center gap-2">
              <User size={18} />
              {post.author}
            </div>
          </div>

          <div 
            className="prose prose-zinc max-w-none prose-lg prose-headings:text-zinc-900 prose-a:text-emerald-600"
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(post.content) }}
          />
        </div>
      </article>

      <div className="mt-8 text-center">
        <button 
          onClick={() => navigate('/store/blog')}
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-zinc-900 font-medium transition-colors"
        >
          <ArrowLeft size={20} />
          Voltar para lista de artigos
        </button>
      </div>
    </div>
  );
}
