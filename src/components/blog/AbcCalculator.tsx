import { useId, useMemo, useState } from 'react';

// Per-zone rates from the governed ICP-default ABC model (400 zones, greenhouse +
// outdoor container yard combined): baseline $148,589/yr, savings bridge
// $47,759 / $63,602 / $79,445 low/mid/high. Dividing by 400 gives the per-zone
// rate the model already scales linearly on (fixed outdoor/greenhouse mix).
// See nursery_abc.py / customer-economics.md in canopy-knowledge for the source.
const BASELINE_PER_ZONE = 148589 / 400;
const LOW_PER_ZONE = 47759 / 400;
const MID_PER_ZONE = 63602 / 400;
const HIGH_PER_ZONE = 79445 / 400;

const MIN_ZONES = 50;
const MAX_ZONES = 1200;
const DEFAULT_ZONES = 400;

// Rounded to the nearest $100 on display, deliberately, so an interactive tool
// doesn't imply more precision than the underlying illustrative model has.
const ROUND_TO = 100;

function formatUsd(n: number): string {
  const rounded = Math.round(n / ROUND_TO) * ROUND_TO;
  return `~${rounded.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`;
}

export default function AbcCalculator() {
  const [zones, setZones] = useState(DEFAULT_ZONES);
  const sliderId = useId();
  const numberId = useId();

  const { baseline, low, mid, high } = useMemo(
    () => ({
      baseline: zones * BASELINE_PER_ZONE,
      low: zones * LOW_PER_ZONE,
      mid: zones * MID_PER_ZONE,
      high: zones * HIGH_PER_ZONE,
    }),
    [zones],
  );

  function handleZones(value: number) {
    if (Number.isNaN(value)) return;
    setZones(Math.min(MAX_ZONES, Math.max(MIN_ZONES, Math.round(value))));
  }

  return (
    <div className="blog-calc">
      <p className="blog-calc__label">Scale the model to your zone count</p>

      <div className="blog-calc__input-row">
        <input
          id={sliderId}
          type="range"
          min={MIN_ZONES}
          max={MAX_ZONES}
          step={10}
          value={zones}
          onChange={(e) => handleZones(Number(e.target.value))}
          className="blog-calc__slider"
          aria-label="Number of irrigation zones"
        />
        <label htmlFor={numberId} className="blog-calc__number-label">
          <input
            id={numberId}
            type="number"
            min={MIN_ZONES}
            max={MAX_ZONES}
            step={10}
            value={zones}
            onChange={(e) => handleZones(Number(e.target.value))}
            className="blog-calc__number"
          />
          zones
        </label>
      </div>

      <div className="blog-calc__results">
        <div className="blog-calc__stat">
          <p className="blog-calc__stat-value">{formatUsd(baseline)}</p>
          <p className="blog-calc__stat-caption">baseline irrigation-touching cost / year</p>
        </div>
        <div className="blog-calc__stat blog-calc__stat--accent">
          <p className="blog-calc__stat-value">{formatUsd(mid)}</p>
          <p className="blog-calc__stat-caption">
            modeled Canopy savings / year (range {formatUsd(low)}&#8211;{formatUsd(high)})
          </p>
        </div>
      </div>

      <p className="blog-calc__disclaimer">
        Rounded estimates, scaled from the illustrative ICP-default model above at a fixed outdoor-yard / greenhouse
        mix. Not a quote: your actual mix, climate, and crop value will move these numbers.
      </p>
    </div>
  );
}
