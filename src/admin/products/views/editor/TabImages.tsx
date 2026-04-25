// ============================================================================
// TabImages - Upload de imagens com preview IMEDIATO
// 2026-04-25 FRENTE 3: preview instantaneo + indicador por imagem + seguranca
// ============================================================================

import React, { useRef, useEffect, useState } from 'react';
import {
  Camera, ChevronLeft, ChevronRight, ArrowUp, X,
  Upload, Loader2, Info, AlertTriangle,
} from 'lucide-react';
import { uploadImageToMedusa, validateImageFile, validateImageFileDeep } from '../../utils/upload';

// Estende o tipo para incluir estado de upload e URL local (blob)
export interface EditorImage {
  id?: string;
  url: string;          // URL final (Medusa) OU blob local durante upload
  file?: File;
  _uploading?: boolean; // true enquanto aguarda resposta do servidor
  _error?: string;      // msg de erro se upload falhou
  _localUrl?: string;   // blob URL local (para revogar depois)
  _tempId?: string;     // identificador unico durante o ciclo de upload
}

export interface TabImagesProps {
  images: EditorImage[];
  setImages: React.Dispatch<React.SetStateAction<EditorImage[]>>;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  setErrors: React.Dispatch<React.SetStateAction<string[]>>;
}

export function TabImages({
  images, setImages, uploading, setUploading, setErrors,
}: TabImagesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingCount, setPendingCount] = useState(0);

  // Revoga blob URLs quando o componente desmonta, para evitar leak de memoria
  useEffect(() => {
    return () => {
      images.forEach(img => {
        if (img._localUrl) URL.revokeObjectURL(img._localUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeImage = (idx: number) =>
    setImages(prev => {
      const img = prev[idx];
      if (img?._localUrl) URL.revokeObjectURL(img._localUrl);
      return prev.filter((_, i) => i !== idx);
    });

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const makePrimary = (idx: number) => moveImage(idx, 0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setErrors([]);
    const validationErrors: string[] = [];

    // === ETAPA 1: validacao sincrona e preview IMEDIATO ===
    // Adicionamos TODAS as imagens validas ao state JA com URL local (blob),
    // para o usuario ver o preview instantaneamente enquanto o upload acontece
    // em segundo plano.
    const toUpload: { tempId: string; file: File; localUrl: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Validacao rapida (MIME + tamanho)
      const quickErr = validateImageFile(file);
      if (quickErr) {
        validationErrors.push(`${file.name}: ${quickErr}`);
        continue;
      }

      // Validacao profunda (magic bytes) — sincrona mas rapida
      const deepErr = await validateImageFileDeep(file);
      if (deepErr) {
        validationErrors.push(`${file.name}: ${deepErr}`);
        continue;
      }

      const tempId = `tmp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
      const localUrl = URL.createObjectURL(file);
      toUpload.push({ tempId, file, localUrl });
    }

    // Mostra erros de validacao ao usuario
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
    }

    // Adiciona ao state com preview local imediato
    if (toUpload.length > 0) {
      setImages(prev => [
        ...prev,
        ...toUpload.map(({ tempId, file, localUrl }) => ({
          url: localUrl,
          file,
          _uploading: true,
          _localUrl: localUrl,
          _tempId: tempId,
        })),
      ]);
      setPendingCount(n => n + toUpload.length);
    }

    // Limpa o input para permitir re-selecao do mesmo arquivo
    if (fileInputRef.current) fileInputRef.current.value = '';

    // === ETAPA 2: upload em paralelo com Promise.allSettled ===
    // Cada imagem faz upload independente. O state e atualizado a medida que
    // cada uma termina.
    await Promise.allSettled(
      toUpload.map(async ({ tempId, file, localUrl }) => {
        try {
          const result = await uploadImageToMedusa(file);
          // Sucesso: substitui a URL local pela URL real do servidor
          setImages(prev => prev.map(img => {
            if (img._tempId !== tempId) return img;
            // Revoga o blob URL para liberar memoria
            if (img._localUrl) URL.revokeObjectURL(img._localUrl);
            return {
              url: result.url,
              _uploading: false,
            };
          }));
        } catch (err: any) {
          // Falha: mantem o preview local mas marca erro e mostra msg
          setImages(prev => prev.map(img =>
            img._tempId === tempId
              ? { ...img, _uploading: false, _error: err?.message || 'Erro desconhecido' }
              : img
          ));
          setErrors(prev => [...prev, `${file.name}: ${err?.message || 'Erro no upload'}`]);
        } finally {
          setPendingCount(n => Math.max(0, n - 1));
        }
      })
    );

    setUploading(false);
  };

  // Retry upload de uma imagem que falhou
  const retryUpload = async (idx: number) => {
    const img = images[idx];
    if (!img?.file) return;
    const tempId = img._tempId || `tmp_retry_${Date.now()}`;
    setImages(prev => prev.map((i, k) =>
      k === idx ? { ...i, _uploading: true, _error: undefined, _tempId: tempId } : i
    ));
    setPendingCount(n => n + 1);
    setUploading(true);
    try {
      const result = await uploadImageToMedusa(img.file);
      setImages(prev => prev.map(i => {
        if (i._tempId !== tempId) return i;
        if (i._localUrl) URL.revokeObjectURL(i._localUrl);
        return { url: result.url, _uploading: false };
      }));
    } catch (err: any) {
      setImages(prev => prev.map(i =>
        i._tempId === tempId ? { ...i, _uploading: false, _error: err?.message || 'Erro' } : i
      ));
      setErrors(prev => [...prev, `Retry falhou: ${err?.message}`]);
    } finally {
      setPendingCount(n => Math.max(0, n - 1));
      setUploading(false);
    }
  };

  const hasImages = images.length > 0;

  return (
    <>
      {hasImages ? (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div key={img._tempId || img.id || img.url || idx} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200 group">
              <img
                src={img.url}
                alt={`Img ${idx + 1}`}
                className={`w-full h-full object-cover ${img._uploading || img._error ? 'opacity-60' : ''}`}
                referrerPolicy="no-referrer"
              />

              {/* Overlay de upload em andamento */}
              {img._uploading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <div className="bg-white/95 rounded-lg px-2 py-1 flex items-center gap-1.5 shadow">
                    <Loader2 size={12} className="animate-spin text-blue-600" />
                    <span className="text-[10px] font-semibold text-blue-700">Enviando...</span>
                  </div>
                </div>
              )}

              {/* Overlay de erro */}
              {img._error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/60 p-1.5 gap-1">
                  <AlertTriangle size={16} className="text-white" />
                  <p className="text-[9px] text-white text-center font-medium leading-tight line-clamp-3 px-1">
                    {img._error}
                  </p>
                  <button
                    onClick={() => retryUpload(idx)}
                    className="bg-white text-red-700 text-[9px] font-bold px-1.5 py-0.5 rounded shadow"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {idx === 0 && !img._uploading && !img._error && (
                <span className="absolute top-0 left-0 right-0 bg-blue-600/85 text-white text-[9px] text-center py-0.5 font-bold uppercase tracking-wider">
                  Principal
                </span>
              )}

              {/* Botoes de acao - so aparecem quando nao esta em upload/erro */}
              {!img._uploading && !img._error && (
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                  <div className="flex gap-1">
                    {idx > 0 && (
                      <button onClick={() => moveImage(idx, idx - 1)} className="w-6 h-6 bg-white/95 rounded-md flex items-center justify-center text-zinc-700 shadow" aria-label="Esquerda">
                        <ChevronLeft size={12} />
                      </button>
                    )}
                    {idx < images.length - 1 && (
                      <button onClick={() => moveImage(idx, idx + 1)} className="w-6 h-6 bg-white/95 rounded-md flex items-center justify-center text-zinc-700 shadow" aria-label="Direita">
                        <ChevronRight size={12} />
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {idx !== 0 && (
                      <button onClick={() => makePrimary(idx)} className="w-6 h-6 bg-blue-500/95 rounded-md flex items-center justify-center text-white shadow" aria-label="Principal" title="Tornar principal">
                        <ArrowUp size={12} />
                      </button>
                    )}
                    <button onClick={() => removeImage(idx)} className="w-6 h-6 bg-red-500/95 rounded-md flex items-center justify-center text-white shadow" aria-label="Remover">
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Botao remover sempre acessivel (mesmo em upload/erro) */}
              {(img._uploading || img._error) && (
                <button
                  onClick={() => removeImage(idx)}
                  className="absolute top-1 right-1 w-6 h-6 bg-red-500/95 rounded-md flex items-center justify-center text-white shadow z-10"
                  aria-label="Cancelar"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-6 text-center text-[12px] text-zinc-500">
          <Camera size={24} className="mx-auto mb-2 text-zinc-300" />
          Nenhuma imagem ainda. Adicione abaixo.
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full mt-2 border-2 border-dashed border-zinc-300 hover:border-blue-400 rounded-xl py-5 flex flex-col items-center justify-center gap-1.5 text-zinc-500 hover:text-blue-600 hover:bg-blue-50/30 disabled:opacity-50"
      >
        {uploading && pendingCount > 0 ? (
          <>
            <Loader2 size={22} className="animate-spin text-blue-500" />
            <span className="text-xs font-medium text-blue-600">
              Enviando {pendingCount} imagem{pendingCount === 1 ? '' : 's'}...
            </span>
          </>
        ) : (
          <>
            <Upload size={20} />
            <span className="text-xs font-semibold">Adicionar imagens</span>
            <span className="text-[10px] text-zinc-400">JPG, PNG, WebP (max 10MB cada)</span>
          </>
        )}
      </button>
      <p className="text-[10px] text-zinc-400 flex items-start gap-1 mt-2">
        <Info size={10} className="shrink-0 mt-0.5" />
        A primeira imagem e a principal (aparece no catalogo). Voce pode reordenar, tornar principal ou remover.
      </p>
    </>
  );
}
