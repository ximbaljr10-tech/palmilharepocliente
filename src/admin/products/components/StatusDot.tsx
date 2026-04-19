import React from 'react';

export function StatusDot({ status }: { status: string }) {
  const pub = status === 'published';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${pub ? 'bg-emerald-500' : 'bg-amber-500'}`}
      title={pub ? 'Publicado' : 'Rascunho'}
    />
  );
}
