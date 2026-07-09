#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Compressão ADAPTATIVA de recibos (imagens e PDFs).

Em vez de qualidade fixa, cada foto/página recebe um ORÇAMENTO DE BYTES.
O script testa da qualidade mais alta pra mais baixa e para na PRIMEIRA
que couber no orçamento. Resultado: qualidade máxima possível dentro do
limite total do PDF final.

Uso:
    python3 comprimir_recibos.py [cap_kb] [pasta_saida]

    cap_kb       -> orçamento por página em KB (padrão: 26)
    pasta_saida  -> padrão: input/recibos_otimizados

Exemplos:
    # versão pro PDF completo (<= 6MB):
    python3 comprimir_recibos.py 26 input/recibos_otimizados

    # versão de mais qualidade pros PDFs em 2 partes (<= 6MB cada):
    python3 comprimir_recibos.py 52 input/recibos_otimizados_hq
"""

import io
import os
import shutil
import sys

import fitz  # PyMuPDF
from PIL import Image, ImageEnhance

INPUT_DIR = "input/recibos"

CAP_KB = float(sys.argv[1]) if len(sys.argv) > 1 else 26.0
OUTPUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "input/recibos_otimizados"

CAP_BYTES = int(CAP_KB * 1024)
PDF_RENDER_DPI = 150      # dpi pra "fotografar" as páginas dos PDFs
CONTRAST_FACTOR = 1.25

# Escada de tentativas: (largura_max, qualidade_jpeg) — da melhor pra pior.
LADDER = [
    (1200, 75),
    (1100, 68),
    (1000, 62),
    (950, 55),
    (900, 50),
    (850, 45),
    (800, 40),
    (750, 35),
    (700, 30),
    (650, 26),
    (600, 22),
    (550, 20),
]

if os.path.exists(OUTPUT_DIR):
    shutil.rmtree(OUTPUT_DIR)
os.makedirs(OUTPUT_DIR, exist_ok=True)


def comprimir_pagina(img):
    """Retorna (bytes_jpeg, (w, h)) da melhor qualidade que cabe no orçamento."""
    img = img.convert("L")
    img = ImageEnhance.Contrast(img).enhance(CONTRAST_FACTOR)

    resultado = None
    for max_w, q in LADDER:
        im = img
        if im.width > max_w:
            ratio = max_w / im.width
            im = im.resize((max_w, int(im.height * ratio)),
                           Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=q, optimize=True)
        data = buf.getvalue()
        resultado = (data, im.size)
        if len(data) <= CAP_BYTES:
            break  # coube no orçamento — usa essa qualidade
    return resultado


def comprimir_tudo():
    arquivos = sorted(os.listdir(INPUT_DIR))
    n_img = n_pdf = 0
    total_bytes = 0
    total_paginas = 0

    print(f"Compressão adaptativa: {len(arquivos)} arquivos | "
          f"orçamento {CAP_KB:.0f} KB/página -> {OUTPUT_DIR}")

    for filename in arquivos:
        input_path = os.path.join(INPUT_DIR, filename)
        ext = os.path.splitext(filename)[1].lower()

        try:
            if ext == ".pdf":
                src = fitz.open(input_path)
                out = fitz.open()
                for pno in range(len(src)):
                    pix = src[pno].get_pixmap(dpi=PDF_RENDER_DPI)
                    img = Image.frombytes("RGB", [pix.width, pix.height],
                                          pix.samples)
                    data, (w, h) = comprimir_pagina(img)
                    # página em pontos, mantendo proporção (72 pt = 1 pol.)
                    pw, ph = w * 72.0 / PDF_RENDER_DPI, h * 72.0 / PDF_RENDER_DPI
                    page = out.new_page(width=pw, height=ph)
                    page.insert_image(page.rect, stream=data)
                    total_bytes += len(data)
                    total_paginas += 1
                src.close()
                out.save(os.path.join(OUTPUT_DIR, filename),
                         garbage=4, deflate=True)
                out.close()
                n_pdf += 1
            else:
                with Image.open(input_path) as img:
                    data, _ = comprimir_pagina(img)
                out_name = os.path.splitext(filename)[0] + ".jpg"
                with open(os.path.join(OUTPUT_DIR, out_name), "wb") as f:
                    f.write(data)
                total_bytes += len(data)
                total_paginas += 1
                n_img += 1
        except Exception as e:
            print(f"Erro ao processar {filename}: {e}")

    print(f"Concluído! {n_img} imagens e {n_pdf} PDFs otimizados.")
    print(f"Total de páginas: {total_paginas} | "
          f"soma dos JPEGs: {total_bytes/1024/1024:.2f} MB")


if __name__ == "__main__":
    comprimir_tudo()
