#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Prestação de Contas da Inventariança — montagem do PDF navegável.

Fluxo:
1. Abre o PDF original (layout 100% preservado).
2. Anexa ao final uma página por documento do ZIP (imagens ajustadas com
   margem, PDFs embutidos vetorialmente, multipágina suportado).
3. Substitui o DESTINO dos hyperlinks existentes (Google Drive) por âncoras
   internas para a página do anexo correspondente (mesma área clicável).
4. Em cada página nova, adiciona rótulo "ANEXO N" e link "⬅ Voltar ao índice"
   que retorna à página exata da tabela de onde o anexo é referenciado.
"""
import fitz
import os
import re
import json
import sys

SRC = "input/Prestacao_de_Contas_Inventarianca_PDF_clicavel.pdf"
RECIBOS = sys.argv[1] if len(sys.argv) > 1 else "input/recibos_otimizados"
OUT = sys.argv[2] if len(sys.argv) > 2 else \
    "output/Prestacao_de_Contas_Inventarianca_ANEXOS_NAVEGAVEL.pdf"
# intervalo opcional de anexos (p/ dividir em partes): min max
NUM_MIN = int(sys.argv[3]) if len(sys.argv) > 3 else None
NUM_MAX = int(sys.argv[4]) if len(sys.argv) > 4 else None

os.makedirs("output", exist_ok=True)

doc = fitz.open(SRC)
n_orig = len(doc)
page_w, page_h = doc[0].rect.width, doc[0].rect.height

# ---------------------------------------------------------------------------
# 1. Mapear: URI do Drive -> número do anexo ; número -> página da tabela
# ---------------------------------------------------------------------------
uri2num = {}
num_table_page = {}
for pno in range(n_orig):
    for l in doc[pno].get_links():
        if l.get("kind") != fitz.LINK_URI:
            continue
        txt = doc[pno].get_textbox(fitz.Rect(l["from"])).strip()
        m = re.fullmatch(r"(\d{1,3}[A-Z]?)", txt)
        if m:
            num = str(int(re.match(r"\d+", m.group(1)).group())) + \
                  (re.search(r"[A-Z]$", m.group(1)).group() if re.search(r"[A-Z]$", m.group(1)) else "")
            uri2num.setdefault(l["uri"], num)
            if pno >= 8:  # páginas da tabela analítica de anexos (9-13)
                num_table_page[num] = pno

# ---------------------------------------------------------------------------
# 2. Arquivos do ZIP -> número normalizado
# ---------------------------------------------------------------------------
def norm(f):
    m = re.match(r"^(\d+)\s*([A-Za-z]?)", f)
    return (str(int(m.group(1))) + m.group(2).upper()) if m else None

def sort_key(num):
    m = re.match(r"(\d+)([A-Z]?)", num)
    return (int(m.group(1)), m.group(2))

file_by_num = {}
for f in sorted(os.listdir(RECIBOS)):
    n = norm(f)
    if n:
        file_by_num[n] = f

nums_sorted = sorted(file_by_num.keys(), key=sort_key)

if NUM_MIN is not None:
    nums_sorted = [n for n in nums_sorted
                   if NUM_MIN <= int(re.match(r"\d+", n).group()) <= NUM_MAX]

# ---------------------------------------------------------------------------
# 3. Anexar páginas (uma por documento; PDFs multipágina = várias páginas)
# ---------------------------------------------------------------------------
GRAY = (0.35, 0.35, 0.35)
BLUE = (0.05, 0.30, 0.60)
MARGIN = 36          # margem segura ~1,27 cm
HEADER_H = 30        # faixa reservada ao cabeçalho das páginas novas

def sanitize(s):
    return (s.replace("–", "-").replace("—", "-").replace("’", "'")
             .replace("“", '"').replace("”", '"'))

def add_header(page, num, fname, table_pno):
    """Rótulo do anexo + link de volta ao índice (somente em páginas novas)."""
    label = sanitize(f"ANEXO {num}  -  {os.path.splitext(fname)[0]}")
    if len(label) > 88:
        label = label[:85] + "..."
    page.insert_text(fitz.Point(MARGIN, 20), label, fontsize=8,
                     fontname="helv", color=GRAY)
    back_txt = "< Voltar ao indice"
    tw = fitz.get_text_length(back_txt, fontname="helv", fontsize=9)
    x0 = page.rect.width - MARGIN - tw
    page.insert_text(fitz.Point(x0, 20), back_txt, fontsize=9,
                     fontname="helv", color=BLUE)
    r = fitz.Rect(x0 - 2, 10, page.rect.width - MARGIN + 2, 24)
    page.draw_line(fitz.Point(x0, 22), fitz.Point(x0 + tw, 22),
                   color=BLUE, width=0.5)
    page.insert_link({"kind": fitz.LINK_GOTO, "from": r,
                      "page": table_pno, "to": fitz.Point(0, 0)})

def fit_rect(page):
    return fitz.Rect(MARGIN, MARGIN + HEADER_H,
                     page.rect.width - MARGIN, page.rect.height - MARGIN)

num_first_page = {}   # número do anexo -> índice da 1ª página anexada
report = []

for num in nums_sorted:
    fname = file_by_num[num]
    path = os.path.join(RECIBOS, fname)
    ext = os.path.splitext(fname)[1].lower()
    table_pno = num_table_page.get(num)
    if table_pno is None:  # ex.: 9A (sem linha própria) -> volta p/ página do nº base
        base = str(int(re.match(r"\d+", num).group()))
        table_pno = num_table_page.get(base, 8)
    first = len(doc)
    if ext == ".pdf":
        sub = fitz.open(path)
        for sp in range(len(sub)):
            page = doc.new_page(width=page_w, height=page_h)
            try:
                page.show_pdf_page(fit_rect(page), sub, sp)
            except Exception as e:
                # fallback: rasterizar
                pix = sub[sp].get_pixmap(dpi=150)
                page.insert_image(fit_rect(page), pixmap=pix)
            add_header(page, num, fname, table_pno)
        npages = len(sub)
        sub.close()
    else:
        page = doc.new_page(width=page_w, height=page_h)
        page.insert_image(fit_rect(page), filename=path,
                          keep_proportion=True)
        add_header(page, num, fname, table_pno)
        npages = 1
    num_first_page[num] = first
    report.append((num, fname, first + 1, npages))

# ---------------------------------------------------------------------------
# 4. Redirecionar hyperlinks existentes -> âncoras internas (mesmo retângulo)
# ---------------------------------------------------------------------------
replaced = 0
kept = 0
for pno in range(n_orig):
    page = doc[pno]
    for l in list(page.get_links()):
        if l.get("kind") != fitz.LINK_URI:
            continue
        num = uri2num.get(l["uri"])
        if num and num in num_first_page:
            page.delete_link(l)
            page.insert_link({"kind": fitz.LINK_GOTO,
                              "from": fitz.Rect(l["from"]),
                              "page": num_first_page[num],
                              "to": fitz.Point(0, 0)})
            replaced += 1
        else:
            kept += 1  # ex.: link da pasta do Drive na capa — mantido

doc.save(OUT, garbage=4, deflate=True)
print(f"OK  paginas originais: {n_orig}  finais: {len(doc)}")
print(f"links redirecionados p/ ancoras internas: {replaced}  mantidos (URI): {kept}")
print(f"anexos inseridos: {len(report)}")
size_mb = os.path.getsize(OUT) / 1024 / 1024
print(f"arquivo: {OUT}  ->  {size_mb:.2f} MB")
json.dump({"report": report}, open("output/report.json", "w"))
