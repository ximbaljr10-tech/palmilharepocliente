import React from 'react';

export function ColorDot({
  name, hex, size = 'sm',
}: {
  name: string;
  hex: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' };
  const isGradient = hex.startsWith('linear');
  const isWhite = hex === '#f5f5f5';
  return (
    <span
      className={`${sizes[size]} rounded-full shrink-0 inline-block ${isWhite ? 'border border-zinc-300' : 'border border-zinc-200/50'}`}
      style={isGradient ? { background: hex } : { backgroundColor: hex }}
      title={name}
    />
  );
}
