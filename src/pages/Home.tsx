import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Product } from '../types';
import { useCart } from '../CartContext';
import { Search, Filter } from 'lucide-react';

export default function Home() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [yardsOptions, setYardsOptions] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYards, setSelectedYards] = useState<string>('');
  const { addToCart } = useCart();

  useEffect(() => {
    fetch('/products.json')
      .then((res) => res.json())
      .then((data: Product[]) => {
        setAllProducts(data);
        setProducts(data);
        
        // Extract unique yards
        const uniqueYards = Array.from(new Set(data.map(p => p.yards).filter((y): y is number => y !== null)));
        setYardsOptions(uniqueYards.sort((a, b) => a - b));
      })
      .catch(err => console.error("Error loading products:", err));
  }, []);

  useEffect(() => {
    let filtered = allProducts;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(q) || 
        (p.description && p.description.toLowerCase().includes(q))
      );
    }

    if (selectedYards) {
      filtered = filtered.filter(p => p.yards === parseInt(selectedYards, 10));
    }

    setProducts(filtered);
  }, [searchQuery, selectedYards, allProducts]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Nossos Produtos</h1>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <input
              type="text"
              placeholder="Buscar produtos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={20} />
            <select
              value={selectedYards}
              onChange={(e) => setSelectedYards(e.target.value)}
              className="w-full sm:w-48 pl-10 pr-8 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all appearance-none"
            >
              <option value="">Todas as jardas</option>
              {yardsOptions.map((yard) => (
                <option key={yard} value={yard}>
                  {yard} jardas
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          Nenhum produto encontrado com esses filtros.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-zinc-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <Link to={`/product/${product.id}`} className="aspect-square bg-zinc-100 overflow-hidden">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.title}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-zinc-400">
                  Sem imagem
                </div>
              )}
            </Link>
            <div className="p-3 sm:p-4 flex flex-col flex-grow">
              <Link to={`/product/${product.id}`} className="font-medium text-sm sm:text-base text-zinc-900 hover:text-emerald-600 line-clamp-2 mb-2">
                {product.title}
              </Link>
              <div className="mt-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
                <span className="text-base sm:text-lg font-bold text-zinc-900">
                  R$ {product.price.toFixed(2).replace('.', ',')}
                </span>
                <button
                  onClick={() => addToCart(product)}
                  className="bg-zinc-900 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-medium hover:bg-zinc-800 transition-colors w-full sm:w-auto"
                >
                  Comprar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
