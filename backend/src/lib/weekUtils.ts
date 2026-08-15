// -----------------------------------------------------------------------------
// Helper: Semana operacional (DOMINGO a SÁBADO)
// Regra: semana começa no DOMINGO e termina no SÁBADO seguinte (6 dias depois).
// Nº da semana operacional = quantos domingos completos existiram desde
// 30/12/YYYY-1 (primeiro domingo após último sábado que acaba no ano) contando
// até o domingo de referência.  Igual ISO mas primeiro dia = domingo.
// -----------------------------------------------------------------------------

export interface OperationalWeek {
  week: string;               // Chave de agrupamento: ex: "2026-W33"
  weekNumber: number;         // 1..53
  yearReference: number;      // Ano de referência (ano do DOMINGO da semana)
  startsOn: Date;             // Domingo 00:00 local
  endsOn: Date;               // Sábado seguinte 23:59:59.999 local
  displayShort: string;       // "W33 · 10 a 16 Ago"
  displayLong: string;        // "Semana 33 · Domingo 10/08 a Sábado 16/08/2026"
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

// Retorna o domingo anterior (ou o próprio dia se já for domingo à meia-noite)
function previousSunday(d: Date): Date {
  const sun = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const weekday = sun.getDay(); // 0 = domingo
  if (weekday !== 0) sun.setDate(sun.getDate() - weekday);
  return sun;
}

function nextSaturday(sunday: Date): Date {
  const sat = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate(), 23, 59, 59, 999);
  sat.setDate(sat.getDate() + 6);
  return sat;
}

// Primeiro domingo do ano (janeiro) — se o dia 1 não for domingo, pega o domingo
function firstSundayOfYear(year: number): Date {
  const jan1 = new Date(year, 0, 1);
  return previousSunday(new Date(year, 0, jan1.getDay() === 0 ? 1 : 8 - jan1.getDay()));
}

// Número da semana operacional (domingo-sábado): conta quantos domingos houve
// desde o primeiro domingo do ano, inclusive.
function weekNumberFromSunday(yearRef: number, sunday: Date): number {
  const janFirstSun = firstSundayOfYear(yearRef);
  if (sunday.getTime() < janFirstSun.getTime()) {
    // Semana começa em dezembro de YYYY-1 (caso raro): semana 52/53 do ano anterior
    const janFirstSunPrev = firstSundayOfYear(yearRef - 1);
    return 1 + Math.round((sunday.getTime() - janFirstSunPrev.getTime()) / (7 * 24 * 3600 * 1000));
  }
  const diffDays = Math.round((sunday.getTime() - janFirstSun.getTime()) / (24 * 3600 * 1000));
  const w = 1 + Math.floor(diffDays / 7);
  // Se exceder 53 semanas (final de ano com +1 domingo), ajusta: é semana 53 do próprio ano
  return w > 53 ? 53 : w;
}

const PT_SHORT_MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function operationalWeekOf(dateInput: Date | string | null | undefined): OperationalWeek {
  const d = (dateInput == null || dateInput === "" || dateInput === null)
    ? new Date()
    : (dateInput instanceof Date ? new Date(dateInput.getTime()) : new Date(dateInput as string));
  if (isNaN(d.getTime())) {
    const now = new Date();
    return operationalWeekOf(now);
  }

  const startsOn = previousSunday(d);
  const yearReference = startsOn.getFullYear();
  const weekNumber = weekNumberFromSunday(yearReference, startsOn);
  const endsOn = nextSaturday(startsOn);

  const weekKey = `${yearReference}-W${pad2(weekNumber)}`; // "2026-W33"
  const sunD = pad2(startsOn.getDate());
  const satD = pad2(endsOn.getDate());
  const month = PT_SHORT_MONTHS[endsOn.getMonth()];
  const displayShort = `W${weekNumber} · ${sunD} a ${satD} ${month}`;
  const displayLong = `Semana ${weekNumber} · Domingo ${sunD}/${pad2(startsOn.getMonth() + 1)} a Sábado ${satD}/${pad2(endsOn.getMonth() + 1)}/${yearReference}`;

  return {
    week: weekKey,
    weekNumber,
    yearReference,
    startsOn,
    endsOn,
    displayShort,
    displayLong,
  };
}

export function parseWeekKey(weekKey: string | null | undefined): {
  yearReference: number;
  weekNumber: number;
  retificacao: boolean;
} | null {
  if (!weekKey) return null;
  const m = String(weekKey).trim().match(/^(\d{4})-W(\d{1,2})(A)?$/);
  if (!m) return null;
  return {
    yearReference: Number(m[1]),
    weekNumber: Number(m[2]),
    retificacao: Boolean(m[3]),
  };
}

export function isWeekClosed(
  weekKey: string | null | undefined,
  referenceDate: Date | string | null | undefined = null,
): boolean {
  const parsed = parseWeekKey(weekKey);
  if (!parsed) return false;
  if (parsed.retificacao) return false;
  const sundayOfWeek = firstSundayOfYear(parsed.yearReference);
  sundayOfWeek.setDate(sundayOfWeek.getDate() + (parsed.weekNumber - 1) * 7);
  const endsOn = nextSaturday(sundayOfWeek);
  const ref = (referenceDate == null || referenceDate === "")
    ? new Date()
    : (referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date(String(referenceDate)));
  if (isNaN(ref.getTime())) return false;
  return ref.getTime() > endsOn.getTime();
}

export function weekKeyFromParts(yearRef: number, weekNumber: number, retificacao = false): string {
  return `${yearRef}-W${pad2(weekNumber)}${retificacao ? "A" : ""}`;
}

// Converte nota/objeto bruto para JSON do orçamento (parseBudgetSerialized equivalente)
// Retorna { labor: [{ desc, price }], total } com base em serviceXName/serviceXPrice
export function flattenServicesFromBudgetNotes(notes: string | null | undefined): {
  items: { desc: string; price: number }[];
  total: number;
} {
  if (!notes) return { items: [], total: 0 };
  // Tenta decode do budget serializado (splitBudgetAndExecution / parseBudgetSerialized pattern)
  // Padrão: "---BEGIN-BUDGET---\n<JSON>\n---END-BUDGET---"
  try {
    const m = notes.match(/---BEGIN-BUDGET---\n([\s\S]*?)\n---END-BUDGET---/);
    if (m && m[1]) {
      const parsed = JSON.parse(m[1]);
      const labor = Array.isArray(parsed?.labor) ? parsed.labor : [];
      const items = labor.map((l: any) => ({
        desc: String(l?.desc ?? l?.description ?? l?.service ?? "Serviço").slice(0, 140),
        price: Number(l?.price ?? l?.value ?? l?.amount ?? 0) || 0,
      }));
      const parts = Array.isArray(parsed?.parts) ? parsed.parts : [];
      const partItems = parts.map((p: any) => ({
        desc: `Peça: ${String(p?.name ?? p?.description ?? p?.label ?? "Peça").slice(0, 120)}`,
        price: Number(p?.price ?? p?.value ?? p?.amount ?? 0) || 0,
      }));
      const all = [...items, ...partItems].filter((x) => x.desc.trim() !== "" && isFinite(x.price));
      const total = all.reduce((s, i) => s + i.price, 0) +
        (Number(parsed?.laborSubtotal ?? 0) || 0) +
        (Number(parsed?.partsSubtotal ?? 0) || 0);
      return {
        items: all.slice(0, 4),
        total: total > 0 ? total : (Number(parsed?.totalAmount ?? parsed?.grandTotal ?? 0) || 0),
      };
    }
  } catch {
    /* ignora */
  }
  return { items: [], total: 0 };
}
