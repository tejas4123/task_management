import type { Frequency } from "@/api/types";
import { Field, Input, Select } from "@/components/ui/Field";
import { formatPeriod } from "@/lib/dates";

/* ---------------------------------------------------------------------------
   Choosing a reporting period.

   A recurring service does not have arbitrary dates - a monthly engagement
   covers a calendar month, a quarterly one covers a quarter. The engagement
   service rejects anything misaligned, so rather than offer two free date
   fields and let the server say no, the control asks for the period in the
   shape the frequency actually allows and derives the dates from it.

   ONE_TIME is the exception, and the only case that gets loose dates.
--------------------------------------------------------------------------- */

export interface Period {
  period_start: string;
  period_end: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

const lastDayOf = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

const dayString = (year: number, month: number, day: number) =>
  `${year}-${pad(month + 1)}-${pad(day)}`;

/** `2026-09` plus a length in months -> the whole span, ending on a month end. */
export function spanFromMonth(monthValue: string, months: number): Period | null {
  const [yearText, monthText] = monthValue.split("-");
  const year = Number(yearText);
  const month = Number(monthText) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 0) return null;

  const endMonthIndex = month + months - 1;
  const endYear = year + Math.floor(endMonthIndex / 12);
  const endMonth = endMonthIndex % 12;

  return {
    period_start: dayString(year, month, 1),
    period_end: dayString(endYear, endMonth, lastDayOf(endYear, endMonth)),
  };
}

export function quarterPeriod(year: number, quarter: number): Period {
  const month = (quarter - 1) * 3;
  return spanFromMonth(`${year}-${pad(month + 1)}`, 3)!;
}

/** The value each frequency starts on, so the dialog is never empty. */
export function defaultPeriod(frequency: Frequency, today: Date): Period {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();

  switch (frequency) {
    case "MONTHLY":
      return spanFromMonth(`${year}-${pad(month + 1)}`, 1)!;
    case "QUARTERLY":
      return quarterPeriod(year, Math.floor(month / 3) + 1);
    case "YEARLY":
      return spanFromMonth(`${year}-01`, 12)!;
    default:
      return {
        period_start: dayString(year, month, 1),
        period_end: dayString(year, month, lastDayOf(year, month)),
      };
  }
}

export function PeriodPicker({
  frequency,
  value,
  onChange,
}: {
  frequency: Frequency;
  value: Period;
  onChange: (period: Period) => void;
}) {
  const startYear = Number(value.period_start.slice(0, 4));
  const startMonth = value.period_start.slice(0, 7);

  const years = Array.from({ length: 5 }, (_, offset) => startYear - 2 + offset);

  if (frequency === "ONE_TIME") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Starts" htmlFor="period-start">
          <Input
            id="period-start"
            type="date"
            value={value.period_start}
            onChange={(event) =>
              onChange({ ...value, period_start: event.target.value })
            }
          />
        </Field>
        <Field label="Ends" htmlFor="period-end">
          <Input
            id="period-end"
            type="date"
            value={value.period_end}
            onChange={(event) => onChange({ ...value, period_end: event.target.value })}
          />
        </Field>
      </div>
    );
  }

  if (frequency === "QUARTERLY") {
    const quarter = Math.floor(Number(value.period_start.slice(5, 7)) / 3) + 1;

    return (
      <Field label="Quarter" hint={summary(value)}>
        <div className="grid grid-cols-2 gap-3">
          <Select
            aria-label="Quarter"
            value={quarter}
            onChange={(event) =>
              onChange(quarterPeriod(startYear, Number(event.target.value)))
            }
          >
            {[1, 2, 3, 4].map((option) => (
              <option key={option} value={option}>
                Q{option}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Year"
            value={startYear}
            onChange={(event) =>
              onChange(quarterPeriod(Number(event.target.value), quarter))
            }
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </div>
      </Field>
    );
  }

  const months = frequency === "YEARLY" ? 12 : 1;

  return (
    <Field
      label={frequency === "YEARLY" ? "Year beginning" : "Month"}
      hint={
        frequency === "YEARLY"
          ? `${summary(value)} · pick April for a financial year`
          : summary(value)
      }
      htmlFor="period-month"
    >
      <Input
        id="period-month"
        type="month"
        value={startMonth}
        onChange={(event) => {
          const next = spanFromMonth(event.target.value, months);
          if (next) onChange(next);
        }}
      />
    </Field>
  );
}

const summary = (period: Period) =>
  `${formatPeriod(period.period_start, period.period_end)} · ${period.period_start} to ${period.period_end}`;
