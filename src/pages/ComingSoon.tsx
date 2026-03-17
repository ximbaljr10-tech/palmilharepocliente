import React, { useEffect, useState } from 'react';

const LOGO_URL = "https://d1a9qnv764bsoo.cloudfront.net/stores/002/383/186/themes/common/logo-2076434406-1663802435-2137b08583cacd89f0378fc3f37146e01663802435.png?0";

export default function ComingSoon() {
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setPulse(p => !p), 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background glow effect */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-600/10 rounded-full blur-[120px] animate-pulse-slow" />
        <div className="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-emerald-600/5 rounded-full blur-[80px] animate-pulse-slow-delay" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 max-w-lg">
        {/* Logo */}
        <div className={`transition-all duration-1000 ${pulse ? 'scale-100 opacity-100' : 'scale-105 opacity-90'}`}>
          <img
            src={LOGO_URL}
            alt="Dente de Tubarão"
            className="h-24 sm:h-32 md:h-36 object-contain drop-shadow-2xl"
            referrerPolicy="no-referrer"
          />
        </div>

        {/* Divider line */}
        <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent my-8 sm:my-10" />

        {/* Main message */}
        <h1 className="text-white text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight leading-tight">
          Estamos ajustando os<br />
          <span className="text-red-500">últimos detalhes.</span>
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg mt-4 sm:mt-6 leading-relaxed max-w-md">
          A Dente de Tubarão já entra no ar.
        </p>

        {/* Animated loading dots */}
        <div className="flex items-center gap-1.5 mt-8">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-bounce-dot" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-red-500 animate-bounce-dot" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-red-500 animate-bounce-dot" style={{ animationDelay: '300ms' }} />
        </div>

        {/* Instagram CTA */}
        <a
          href="https://www.instagram.com/dentedetubaraooficial/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 inline-flex items-center gap-3 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:from-purple-700 hover:via-pink-600 hover:to-orange-500 text-white px-6 py-3 rounded-full font-bold text-sm sm:text-base transition-all hover:scale-105 shadow-lg shadow-pink-900/20"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
          </svg>
          @dentedetubaraooficial
        </a>
      </div>

      {/* Footer */}
      <div className="absolute bottom-6 text-zinc-600 text-xs tracking-wider">
        DENTE DE TUBAR&Atilde;O &copy; {new Date().getFullYear()}
      </div>
    </div>
  );
}
