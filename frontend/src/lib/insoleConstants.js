/**
 * Axiom / 3DPÉ — Tabelas de opcoes para prescricao de palmilhas.
 * Baseado no sistema fisico de referencia.
 */

export const TIPO_CALCADO = [
  { value: "SAPATO_INTEIRA", label: "Sapato (inteira)" },
  { value: "TENIS", label: "Tênis" },
  { value: "SAPATO_34", label: "Sapato 3/4" },
  { value: "CHINELO", label: "Chinelo" },
  { value: "CHUTEIRA", label: "Chuteira" },
  { value: "PALMILHA", label: "Palmilha" },
];

// Numeracao BR (33-46)
export const NUMERACAO_OPTIONS = Array.from({ length: 14 }, (_, i) => {
  const n = 33 + i;
  return { value: String(n), label: String(n) };
});

export const TIPO_MODELO = [
  { value: "COMFORT_BEGE",  label: "Palmilha Comfort + Base Bege" },
  { value: "SLIM_FORRO",    label: "Palmilha Slim + Base Forro" },
  { value: "SLIM_TR_TR",    label: "Palmilha Slim TR + Base TR" },
  { value: "SOFT_AMARELO",  label: "Palmilha Soft + Base Amarelo" },
  { value: "SOFT_AZUL",     label: "Palmilha Soft + Base Azul" },
  { value: "SOFT_PRETO",    label: "Palmilha Soft + Base Preto" },
  { value: "SOFT_ROSA",     label: "Palmilha Soft + Base Rosa" },
  { value: "SOFT_VERMELHO", label: "Palmilha Soft + Base Vermelho" },
];

export const TIPO_REVESTIMENTO = [
  { value: "EVA",           label: "EVA" },
  { value: "COURO",         label: "Couro" },
  { value: "TECIDO",        label: "Tecido técnico" },
  { value: "SINTETICO",     label: "Sintético" },
];

export const REVESTIMENTO_EVA = [
  { value: "EVA_AMARELO",   label: "EVA Amarelo",  hex: "#f7d94c" },
  { value: "EVA_AZUL",      label: "EVA Azul",     hex: "#2563eb" },
  { value: "EVA_BEGE",      label: "EVA Bege",     hex: "#e9d8b6" },
  { value: "EVA_PRETO",     label: "EVA Preto",    hex: "#111111" },
  { value: "EVA_ROSA",      label: "EVA Rosa",     hex: "#ec4899" },
  { value: "EVA_VERMELHO",  label: "EVA Vermelho", hex: "#dc2626" },
  { value: "EVA_VERDE",     label: "EVA Verde",    hex: "#16a34a" },
];

/**
 * Especificacoes tecnicas por pe.
 * Cada item eh um checkbox + um campo de medida (mm).
 * `region` é a área do mapa do pé que fica destacada quando o item é marcado.
 */
export const ESPECIFICACOES = [
  { key: "CIC",              label: "CIC",              region: "retro_medial",  hint: "Cunha Interna Calcânea" },
  { key: "CAVR",             label: "CAVR",             region: "medio_lateral", hint: "Cunha de Apoio Varo de Retropé" },
  { key: "CAVR_TOTAL",       label: "CAVR total",       region: "antepe_lateral",hint: "Cunha Varo Retropé Total" },
  { key: "CAVR_PROLONGADA",  label: "CAVR prolongada",  region: "lateral_all",   hint: "Cunha Varo Retropé Prolongada" },
  { key: "CAVL",             label: "CAVL",             region: "medio_medial",  hint: "Cunha Apoio Valgo" },
  { key: "CAVL_TOTAL",       label: "CAVL total",       region: "antepe_medial", hint: "Cunha Valgo Total" },
  { key: "CAVL_PROLONGADA",  label: "CAVL prolongada",  region: "medial_all",    hint: "Cunha Valgo Prolongada" },
  { key: "BRC",              label: "BRC",              region: "retro_center",  hint: "Barra Retrocapital" },
  { key: "BOTON",            label: "Botón",            region: "antepe_center", hint: "Botão metatarsal" },
  { key: "BIC",              label: "BIC",              region: "medio_center",  hint: "Barra infracapital" },
  { key: "ARCO_LONGITUDINAL",label: "ARCO longitudinal",region: "arch",          hint: "Apoio do arco longitudinal" },
];

/** Cria a estrutura padrao de detalhes (pe esquerdo + pe direito). */
export const newSideDetails = () => {
  const obj = {};
  ESPECIFICACOES.forEach((e) => {
    obj[e.key] = { enabled: false, value: "" };
  });
  return obj;
};

export const DEFAULT_DETAILS = () => ({
  left:  newSideDetails(),
  right: newSideDetails(),
});

/** Preço base por tipo de modelo (pode ser ajustado em Admin > Configurações). */
export const PRECO_BASE = {
  COMFORT_BEGE:  250.0,
  SLIM_FORRO:    260.0,
  SLIM_TR_TR:    280.0,
  SOFT_AMARELO:  250.0,
  SOFT_AZUL:     250.0,
  SOFT_PRETO:    250.0,
  SOFT_ROSA:     250.0,
  SOFT_VERMELHO: 250.0,
};

export const labelFromList = (list, value) => {
  const found = list.find((x) => x.value === value);
  return found ? found.label : value || "";
};
