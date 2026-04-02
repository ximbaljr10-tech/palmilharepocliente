import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbsProps {
  items: {
    label: string;
    path?: string;
  }[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center text-sm text-zinc-500 mb-6 overflow-x-auto whitespace-nowrap pb-2">
      <Link to="/store" className="hover:text-emerald-600 transition-colors flex items-center">
        <Home size={16} />
      </Link>
      
      {items.map((item, index) => (
        <div key={index} className="flex items-center">
          <ChevronRight size={14} className="mx-2 text-zinc-400" />
          {item.path ? (
            <Link 
              to={item.path} 
              className="hover:text-emerald-600 transition-colors font-medium"
            >
              {item.label}
            </Link>
          ) : (
            <span className="text-zinc-900 font-medium truncate max-w-[200px] sm:max-w-xs">
              {item.label}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
