import React from "react";

/**
 * FootDiagram — ilustracao plantar dos dois pés com regioes coloriveis.
 *
 * Props:
 *   leftDetails  : { CIC:{enabled,value}, CAVR:{...}, ... }
 *   rightDetails : idem
 *
 * Regioes (areas que ficam coloridas com base nas especificacoes marcadas):
 *   - retro_medial  : calcanhar lado interno
 *   - retro_center  : calcanhar centro
 *   - retro_lateral : calcanhar lado externo
 *   - medio_medial  : arco interno
 *   - medio_center  : centro do pé
 *   - medio_lateral : arco externo
 *   - antepe_medial : hálux/1º met
 *   - antepe_center : 2º-4º met
 *   - antepe_lateral: 5º met
 *   - arch          : toda a cavidade do arco
 *
 * Mapeamento espec → região (cor):
 *   CIC              → retro_medial   (amarelo)
 *   CAVR             → medio_lateral  (amarelo)
 *   CAVR_TOTAL       → antepe_lateral (amarelo forte)
 *   CAVR_PROLONGADA  → faixa lateral completa (laranja)
 *   CAVL             → medio_medial   (azul)
 *   CAVL_TOTAL       → antepe_medial  (azul forte)
 *   CAVL_PROLONGADA  → faixa medial completa (azul escuro)
 *   BRC              → retro_center   (verde)
 *   BOTON            → antepe_center  (roxo — metatarsal)
 *   BIC              → medio_center   (rosa)
 *   ARCO_LONGITUDINAL→ arch           (laranja suave)
 */

const REGION_COLORS = {
  CIC:               "#f7d94c", // retro_medial
  CAVR:              "#f7d94c", // medio_lateral
  CAVR_TOTAL:        "#f59e0b", // antepe_lateral
  CAVR_PROLONGADA:   "#ea580c",
  CAVL:              "#60a5fa", // medio_medial
  CAVL_TOTAL:        "#2563eb", // antepe_medial
  CAVL_PROLONGADA:   "#1e3a8a",
  BRC:               "#34d399", // retro_center
  BOTON:             "#a855f7", // antepe_center
  BIC:               "#f472b6", // medio_center
  ARCO_LONGITUDINAL: "#fb923c", // arch
};

/** pega as chaves marcadas de um lado */
const activeKeys = (side) =>
  Object.keys(side || {}).filter((k) => side[k]?.enabled);

/** Componente de um pé (esquerdo ou direito). mirror=true → pé direito */
function Foot({ side, details, title }) {
  const active = new Set(activeKeys(details));
  const mirror = side === "right";

  // helper p/ mostrar cor da região se chave está ativa
  const fillIf = (key) => (active.has(key) ? REGION_COLORS[key] : "transparent");

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <svg
        viewBox="0 0 140 280"
        className="w-full max-w-[160px] h-auto"
        style={{ transform: mirror ? "scaleX(-1)" : "none" }}
      >
        {/* Arco longitudinal (preenche a cavidade antes das bordas) */}
        <path
          d="M 52 90 Q 40 140, 58 200 Q 80 180, 78 140 Q 80 105, 52 90 Z"
          fill={fillIf("ARCO_LONGITUDINAL")}
          opacity="0.55"
        />

        {/* Retro (calcanhar) — 3 zonas */}
        <path
          d="M 38 220 Q 30 250, 55 268 Q 68 270, 70 250 Q 68 230, 58 218 Z"
          fill={fillIf("CIC")}
          opacity="0.75"
        />
        <path
          d="M 58 218 Q 68 230, 70 250 Q 72 265, 82 265 Q 92 260, 92 240 Q 90 220, 78 215 Z"
          fill={fillIf("BRC")}
          opacity="0.75"
        />
        <path
          d="M 78 215 Q 90 220, 92 240 Q 94 265, 108 265 Q 118 250, 112 225 Q 100 212, 85 212 Z"
          fill={fillIf("CAVR_PROLONGADA")}
          opacity="0.55"
        />

        {/* Medio (arco) — medial/centro/lateral */}
        <path
          d="M 42 140 Q 38 180, 50 210 Q 58 210, 62 190 Q 60 160, 52 140 Z"
          fill={fillIf("CAVL")}
          opacity="0.7"
        />
        <path
          d="M 62 190 Q 70 190, 78 190 Q 82 170, 80 150 Q 72 145, 62 150 Z"
          fill={fillIf("BIC")}
          opacity="0.7"
        />
        <path
          d="M 78 190 Q 95 195, 105 188 Q 110 160, 102 140 Q 90 140, 82 150 Z"
          fill={fillIf("CAVR")}
          opacity="0.7"
        />

        {/* Antepé — medial/centro/lateral (linha dos metatarsos) */}
        <path
          d="M 46 90 Q 40 115, 46 140 Q 60 138, 66 125 Q 66 100, 58 80 Z"
          fill={fillIf("CAVL_TOTAL")}
          opacity="0.75"
        />
        <path
          d="M 66 125 Q 74 130, 86 128 Q 92 110, 86 85 Q 74 80, 66 85 Z"
          fill={fillIf("BOTON")}
          opacity="0.75"
        />
        <path
          d="M 86 128 Q 100 130, 108 118 Q 114 95, 104 80 Q 92 78, 86 85 Z"
          fill={fillIf("CAVR_TOTAL")}
          opacity="0.75"
        />

        {/* Faixa medial completa (CAVL_PROLONGADA) */}
        <path
          d="M 42 90 Q 32 150, 38 220 Q 28 230, 30 180 Q 28 130, 42 90 Z"
          fill={fillIf("CAVL_PROLONGADA")}
          opacity="0.5"
        />

        {/* Contorno oficial do pé — contorno preto */}
        <path
          d="
            M 52 16
            Q 62 6, 74 10
            Q 88 14, 94 28
            Q 100 42, 102 56
            Q 116 62, 120 78
            Q 122 98, 116 120
            Q 122 150, 120 180
            Q 118 210, 110 240
            Q 106 268, 80 272
            Q 48 274, 36 250
            Q 26 220, 30 180
            Q 30 150, 36 120
            Q 34 100, 40 80
            Q 42 55, 50 34
            Q 50 22, 52 16 Z"
          fill="none"
          stroke="#111827"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Dedos — círculos pontilhados */}
        <g stroke="#111827" strokeWidth="1.5" fill="none" strokeDasharray="2 2">
          <ellipse cx="62" cy="18" rx="10" ry="12" />
          <ellipse cx="80" cy="14" rx="8" ry="10" />
          <ellipse cx="94" cy="20" rx="7" ry="9" />
          <ellipse cx="104" cy="30" rx="6" ry="8" />
          <ellipse cx="112" cy="42" rx="5" ry="7" />
        </g>

        {/* Linhas anatômicas (divisoes internas) */}
        <g stroke="#9ca3af" strokeWidth="0.8" fill="none" strokeDasharray="3 2">
          <path d="M 30 130 Q 70 125, 120 130" />
          <path d="M 26 210 Q 70 200, 116 210" />
          <path d="M 70 50 L 70 260" />
        </g>
      </svg>
    </div>
  );
}

export default function FootDiagram({ leftDetails, rightDetails }) {
  return (
    <div className="grid grid-cols-2 gap-3 w-full max-w-sm mx-auto">
      <Foot side="left"  title="Pé esquerdo" details={leftDetails} />
      <Foot side="right" title="Pé direito"  details={rightDetails} />
    </div>
  );
}
