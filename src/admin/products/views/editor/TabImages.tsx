import React, { useRef } from 'react';
import {
  Camera, ChevronLeft, ChevronRight, ArrowUp, X,
  Upload, Loader2, Info,
} from 'lucide-react';
import { uploadImageToMedusa, validateImageFile } from '../../utils/upload';

export interface TabImagesProps {
  images: { id?: string; url: string; file?: File }[];
  setImages: React.Dispatch<React.SetStateAction<{ id?: string; url: string; file?: File }[]>>;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  setErrors: React.Dispatch<React.SetStateAction<string[]>>;
}

export function TabImages({
  images, setImages, uploading, setUploading, setErrors,
}: TabImagesProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const removeImage = (idx: number) =>
    setImages(prev => prev.filter((_, i) => i !== idx));
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
    const newErrors: string[] = [];
    const newImages: { url: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validationError = validateImageFile(file);
      if (validationError) { newErrors.push(`${file.name}: ${validationError}`); continue; }
      try {
        const result = await uploadImageToMedusa(file);
        newImages.push(result);
      } catch (err: any) {
        newErrors.push(`${file.name}: ${err.message}`);
      }
    }
    if (newImages.length > 0) setImages(prev => [...prev, ...newImages]);
    if (newErrors.length > 0) setErrors(newErrors);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, idx) => (
            <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
              <img src={img.url} alt={`Img ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              {idx === 0 && (
                <span className="absolute top-0 left-0 right-0 bg-blue-600/85 text-white text-[9px] text-center py-0.5 font-bold uppercase tracking-wider">
                  Principal
                </span>
              )}
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
        className="w-full border-2 border-dashed border-zinc-300 hover:border-blue-400 rounded-xl py-5 flex flex-col items-center justify-center gap-1.5 text-zinc-500 hover:text-blue-600 hover:bg-blue-50/30 disabled:opacity-50"
      >
        {uploading ? (
          <>
            <Loader2 size={22} className="animate-spin text-blue-500" />
            <span className="text-xs font-medium text-blue-600">Fazendo upload...</span>
          </>
        ) : (
          <>
            <Upload size={20} />
            <span className="text-xs font-semibold">Adicionar imagens</span>
            <span className="text-[10px] text-zinc-400">JPG, PNG, WebP (max 10MB)</span>
          </>
        )}
      </button>
      <p className="text-[10px] text-zinc-400 flex items-start gap-1">
        <Info size={10} className="shrink-0 mt-0.5" />
        A primeira imagem e a principal (aparece no catalogo).
      </p>
    </>
  );
}
