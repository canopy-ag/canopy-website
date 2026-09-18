import { useId, useMemo, useState } from 'react';

// Per-zone rates from the illustrative ICP-default ABC model (400 zones, greenhouse +
// outdoor container yard combined): baseline, then the savings bridge low/mid/high.
// Dividing by 400 gives the per-zone rate the model already scales linearly on, at a
// fixed outdoor/greenhouse mix. Source: nursery_abc.py against customer-economics.md.
const BASELINE_PER_ZONE = 148589 / 400;
const LOW_PER_ZONE = 47759 / 400;
const MID_PER_ZONE = 63602 / 400;
const HIGH_PER_ZONE = 79445 / 400;

const HOURS_PER_FTE_YEAR = 2080;

const MIN_ZONES = 50;
const MAX_ZONES = 1200;
const DEFAULT_ZONES = 400;

const MIN_FTES = 1;
const MAX_FTES = 300;
const DEFAULT_FTES = 30;

const MIN_RATE = 8;
const MAX_RATE = 80;
const DEFAULT_RATE = 24;

const MAX_EFFICIENCY = 10;
const DEFAULT_EFFICIENCY = 2;

// Displayed figures round to the nearest $100, deliberately: an interactive tool
// shouldn't imply more precision than the underlying illustrative model has.
const ROUND_TO = 100;

function formatUsdBare(n: number): string {
  const rounded = Math.round(n / ROUND_TO) * ROUND_TO;
  return rounded.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function formatUsd(n: number): string {
  return `~${formatUsdBare(n)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default function AbcCalculator() {
  const [zones, setZones] = useState(DEFAULT_ZONES);
  const [ftes, setFtes] = useState(DEFAULT_FTES);
  const [rate, setRate] = useState(DEFAULT_RATE);
  const [efficiency, setEfficiency] = useState(DEFAULT_EFFICIENCY);

  const zonesId = useId();
  const ftesId = useId();
  const rateId = useId();
  const efficiencyId = useId();

  const { baseline, low, mid, high, laborBase, efficiencyValue, parityPct } = useMemo(() => {
    const laborBaseValue = ftes * HOURS_PER_FTE_YEAR * rate;
    const midSavings = zones * MID_PER_ZONE;
    return {
      baseline: zones * BASELINE_PER_ZONE,
      low: zones * LOW_PER_ZONE,
      mid: midSavings,
      high: zones * HIGH_PER_ZONE,
      laborBase: laborBaseValue,
      efficiencyValue: laborBaseValue * (efficiency / 100),
      parityPct: laborBaseValue > 0 ? (midSavings / laborBaseValue) * 100 : null,
    };
  }, [zones, ftes, rate, efficiency]);

  return (
    <div className="blog-calc">
      <p className="blog-calc__label">Run it on your own numbers</p>

      <div className="blog-calc__group">
        <p className="blog-calc__group-label">Irrigation</p>
        <div className="blog-calc__input-row">
          <input
            type="range"
            min={MIN_ZONES}
            max={MAX_ZONES}
            step={10}
            value={zones}
            onChange={(e) => setZones(clamp(Number(e.target.value), MIN_ZONES, MAX_ZONES))}
            className="blog-calc__slider"
            aria-label="Number of irrigation zones"
          />
          <label htmlFor={zonesId} className="blog-calc__field">
            <input
              id={zonesId}
              type="number"
              min={MIN_ZONES}
              max={MAX_ZONES}
              step={10}
              value={zones}
              onChange={(e) => setZones(clamp(Number(e.target.value) || MIN_ZONES, MIN_ZONES, MAX_ZONES))}
              className="blog-calc__number"
            />
            zones
          </label>
        </div>
      </div>

      <div className="blog-calc__group">
        <p className="blog-calc__group-label">Field crew</p>
        <div className="blog-calc__input-row blog-calc__input-row--pair">
          <label htmlFor={ftesId} className="blog-calc__field">
            <input
              id={ftesId}
              type="number"
              min={MIN_FTES}
              max={MAX_FTES}
              step={1}
              value={ftes}
              onChange={(e) => setFtes(clamp(Number(e.target.value) || MIN_FTES, MIN_FTES, MAX_FTES))}
              className="blog-calc__number"
            />
            full-time equivalents
          </label>
          <label htmlFor={rateId} className="blog-calc__field">
            $
            <input
              id={rateId}
              type="number"
              min={MIN_RATE}
              max={MAX_RATE}
              step={1}
              value={rate}
              onChange={(e) => setRate(clamp(Number(e.target.value) || MIN_RATE, MIN_RATE, MAX_RATE))}
              className="blog-calc__number"
            />
            per hour, loaded
          </label>
        </div>
        <div className="blog-calc__input-row">
          <input
            type="range"
            min={0}
            max={MAX_EFFICIENCY}
            step={0.5}
            value={efficiency}
            onChange={(e) => setEfficiency(clamp(Number(e.target.value), 0, MAX_EFFICIENCY))}
            className="blog-calc__slider"
            aria-label="Hypothetical field-labor efficiency gain, percent"
          />
          <label htmlFor={efficiencyId} className="blog-calc__field">
            <input
              id={efficiencyId}
              type="number"
              min={0}
              max={MAX_EFFICIENCY}
              step={0.5}
              value={efficiency}
              onChange={(e) => setEfficiency(clamp(Number(e.target.value) || 0, 0, MAX_EFFICIENCY))}
              className="blog-calc__number"
            />
            % efficiency gain
          </label>
        </div>
      </div>

      <div className="blog-calc__results">
        <div className="blog-calc__stat">
          <p className="blog-calc__stat-value">{formatUsd(mid)}</p>
          <p className="blog-calc__stat-caption">
            modeled irrigation savings / year (range {formatUsd(low)} to {formatUsdBare(high)}, against a{' '}
            {formatUsd(baseline)} irrigation baseline)
          </p>
        </div>
        <div className="blog-calc__stat blog-calc__stat--accent">
          <p className="blog-calc__stat-value">{formatUsd(efficiencyValue)}</p>
          <p className="blog-calc__stat-caption">
            what a {efficiency}% field-labor efficiency gain is worth / year (against a {formatUsd(laborBase)} labor
            base). Your assumption, not our claim.
          </p>
        </div>
      </div>

      {parityPct !== null && (
        <p className="blog-calc__punchline">
          At these numbers, the modeled irrigation savings are worth about the same as a{' '}
          <b>{parityPct.toFixed(1)}% gain in field-labor efficiency</b>. Which of those two is easier to get in your
          operation is exactly the question a blended overhead rate can't answer.
        </p>
      )}

      <p className="blog-calc__disclaimer">
        Rounded estimates. The irrigation side scales the illustrative model above linearly at a fixed outdoor-yard /
        greenhouse mix. The labor side is entirely your inputs: Canopy holds no wage, pay, or worker record, so the
        crew size and loaded rate have to come from you. FTEs are counted as 2,080-hour equivalents, so enter a
        seasonal crew as its full-year equivalent. Your crew number includes whatever hours already go to irrigation
        (about one FTE in the model above), so the two figures overlap slightly. Not a quote, and not a forecast.
      </p>
    </div>
  );
}
