// ============================================================================
// CurrencyInput - Input inteligente de moeda BRL
// ----------------------------------------------------------------------------
// Como funciona:
//   • O usuário digita apenas dígitos: 4390
//   • O componente interpreta como centavos → 43,90
//   • Exibe formatado em tempo real via Intl.NumberFormat("pt-BR")
//   • NUNCA confiar em string com vírgula/ponto vinda do usuário.
//
// Regras de conversão (por quantidade de dígitos, tirados os zeros à esquerda):
//   1 dígito  → 0,01 .. 0,09
//   2 dígitos → 0,10 .. 0,99
//   3 dígitos → 1,00 .. 9,99
//   4 dígitos → 10,00 .. 99,99
//   5 dígitos → 100,00 .. 999,99   (e assim por diante)
//
// Exemplo:
//   Input: "4390"  → cents=4390 → render "R$ 43,90"
//   Input: "100"   → cents=100  → render "R$ 1,00"
//   Input: "9"     → cents=9    → render "R$ 0,09"
//
// API do componente:
//   valueCents:  número inteiro de centavos (ou null quando vazio)
//   onChange:    callback com o novo número inteiro de centavos (ou null)
//
// O componente não chama o backend — quem usa é responsável por converter
// para reais na hora de salvar (reais = cents / 100).
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';

const BRL_FMT = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata centavos como string BRL: 4390 -> "R$ 43,90" */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) {
    return BRL_FMT.format(0);
  }
  const safe = Math.max(0, Math.floor(cents));
  return BRL_FMT.format(safe / 100);
}

/** Converte um valor em REAIS (pode vir com decimal) para centavos inteiro. */
export function reaisToCents(reais: number | null | undefined): number | null {
  if (reais === null || reais === undefined) return null;
  if (!Number.isFinite(Number(reais))) return null;
  // Arredonda para evitar imprecisões de ponto flutuante (ex: 45.9 * 100 = 4589.999…)
  return Math.round(Number(reais) * 100);
}

/** Converte centavos (inteiro) para REAIS (float com 2 casas). */
export function centsToReais(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

export interface CurrencyInputProps {
  /** Valor interno em centavos inteiros (ou null quando vazio) */
  valueCents: number | null;
  onChange: (cents: number | null) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  /** Limite máximo de centavos aceito (evita overflow). Default: 99_999_999 (R$ 999.999,99) */
  maxCents?: number;
  autoFocus?: boolean;
}

export function CurrencyInput(props: CurrencyInputProps) {
  const {
    valueCents,
    onChange,
    placeholder = 'R$ 0,00',
    className = '',
    id,
    disabled,
    maxCents = 99_999_999,
    autoFocus,
  } = props;

  // displayValue é o que aparece no <input>. É sempre derivado de `cents`.
  // Mantemos local pra permitir mostrar vazio enquanto o user apaga tudo.
  const [touched, setTouched] = useState(false);

  const display = useMemo(() => {
    if (valueCents === null || valueCents === undefined) return '';
    return formatCents(valueCents);
  }, [valueCents]);

  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (autoFocus && inputRef.current) inputRef.current.focus();
  }, [autoFocus]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTouched(true);
    const raw = e.target.value;
    // Extrai só dígitos. Qualquer vírgula/ponto/letra/R$ é descartado.
    const onlyDigits = raw.replace(/\D+/g, '');
    if (onlyDigits === '') {
      onChange(null);
      return;
    }
    // Interpreta dígitos como centavos: "4390" → 4390 centavos
    // "000100" → 100 (trim leading zeros via parseInt)
    let cents = parseInt(onlyDigits, 10);
    if (!Number.isFinite(cents) || cents < 0) cents = 0;
    if (cents > maxCents) cents = maxCents;
    onChange(cents);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Backspace num campo formatado precisa "comer" o último dígito dos centavos.
    // O browser tenta deletar o " " ou "," — isso deixa tudo louco. Então
    // interceptamos e reescrevemos o valor.
    if (e.key === 'Backspace') {
      if (valueCents === null || valueCents === 0) {
        onChange(null);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const next = Math.floor(valueCents / 10);
      onChange(next === 0 ? null : next);
    }
  };

  // Ao ganhar foco, move o cursor pro fim (garantindo que novos dígitos
  // entrem sempre no lado direito — essência do input tipo "ATM").
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    const len = e.target.value.length;
    try {
      e.target.setSelectionRange(len, len);
    } catch (_) {}
  };

  // Placeholder aparece só quando não tem valor e não foi "tocado" com vazio.
  const showPlaceholder = (valueCents === null || valueCents === undefined) && !touched;

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      disabled={disabled}
      value={display}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      placeholder={showPlaceholder ? placeholder : undefined}
      className={className}
      aria-label={props['aria-label']}
    />
  );
}
