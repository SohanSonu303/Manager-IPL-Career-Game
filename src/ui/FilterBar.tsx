import { useState } from 'react'
import { BATTING_TRAITS, BOWLING_TRAITS } from '@/data'
import { TRAIT_LABEL } from './format'
import { Icon } from './kit/Icon'
import { Sheet } from './kit/kit'
import { activeCount, DEFAULT_FILTERS, type PlayerFilters } from './playerFilters'

const ROLE: [PlayerFilters['role'], string][] = [
  ['any', 'All'],
  ['batter', 'Batters'],
  ['wicketkeeper', 'Keepers'],
  ['allrounder', 'All-rounders'],
  ['bowler', 'Bowlers'],
]
const ORIGIN: [PlayerFilters['origin'], string][] = [
  ['any', 'Any'],
  ['domestic', 'Indian'],
  ['overseas', 'Overseas'],
]
const BOWLING: [PlayerFilters['bowling'], string][] = [
  ['any', 'Any'],
  ['pace', 'Pace'],
  ['spin', 'Spin'],
]
const AGE: [PlayerFilters['age'], string][] = [
  ['any', 'Any'],
  ['u23', 'Under 23'],
  ['23-28', '23–28'],
  ['29-33', '29–33'],
  ['34+', '34+'],
]
const OVERALL: [number, string][] = [
  [0, 'Any'],
  [60, '60+'],
  [65, '65+'],
  [70, '70+'],
  [75, '75+'],
]
const PRICE: [PlayerFilters['price'], string][] = [
  ['any', 'Any'],
  ['u1', 'Under ₹1 cr'],
  ['1-5', '₹1–5 cr'],
  ['5-15', '₹5–15 cr'],
  ['15+', '₹15 cr+'],
]
const AVAIL: [PlayerFilters['availability'], string][] = [
  ['any', 'Any'],
  ['fit', 'Fit'],
  ['injured', 'Injured'],
]
const SORT: [PlayerFilters['sort'], string][] = [
  ['overall', 'Rating'],
  ['potential', 'Potential'],
  ['form', 'Form'],
  ['age', 'Age (young first)'],
  ['price', 'Price (high first)'],
  ['name', 'Name'],
]

function Group<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="fgroup">
      <span className="dim">{label}</span>
      <div className="filters">
        {options.map(([v, text]) => (
          <button key={String(v)} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Search box, quick role chips and a Filters sheet (origin, bowling, age, rating, skill,
 * price, availability, sort). `priceLabel` names what the price band means on this list.
 */
export function FilterBar({
  value,
  onChange,
  count,
  total,
  priceLabel = 'Price',
}: {
  value: PlayerFilters
  onChange: (f: PlayerFilters) => void
  count: number
  total: number
  priceLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<PlayerFilters>) => onChange({ ...value, ...patch })
  const n = activeCount({ ...value, search: '', role: 'any' })
  return (
    <>
      <div className="fbar">
        <input
          className="fsearch"
          type="search"
          placeholder="Search players"
          aria-label="Search players"
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
        />
        <button className="fbtn" onClick={() => setOpen(true)} aria-label="Open filters">
          <Icon name="filter" size={20} />
          Filters{n ? ` (${n})` : ''}
        </button>
      </div>
      <div className="filters" role="tablist">
        {ROLE.map(([r, label]) => (
          <button
            key={r}
            role="tab"
            aria-selected={value.role === r}
            className={value.role === r ? 'on' : ''}
            onClick={() => set({ role: r })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="row-between fcount">
        <span className="dim">
          {count === total ? `${total} players` : `${count} of ${total} players`} · by{' '}
          {SORT.find(([s]) => s === value.sort)?.[1].toLowerCase()}
        </span>
        {(activeCount(value) > 0 || value.sort !== 'overall') && (
          <button className="link-btn" onClick={() => onChange(DEFAULT_FILTERS)}>
            Reset
          </button>
        )}
      </div>

      {open && (
        <Sheet title="Filters" onClose={() => setOpen(false)}>
          <Group
            label="Sort by"
            options={SORT}
            value={value.sort}
            onChange={(sort) => set({ sort })}
          />
          <Group
            label="Nationality"
            options={ORIGIN}
            value={value.origin}
            onChange={(origin) => set({ origin })}
          />
          <Group
            label="Bowling"
            options={BOWLING}
            value={value.bowling}
            onChange={(bowling) => set({ bowling })}
          />
          <Group label="Age" options={AGE} value={value.age} onChange={(age) => set({ age })} />
          <Group
            label="Overall rating"
            options={OVERALL}
            value={value.minOverall}
            onChange={(minOverall) => set({ minOverall })}
          />
          <Group
            label={priceLabel}
            options={PRICE}
            value={value.price}
            onChange={(price) => set({ price })}
          />
          <Group
            label="Availability"
            options={AVAIL}
            value={value.availability}
            onChange={(availability) => set({ availability })}
          />
          <div className="fgroup">
            <span className="dim">Skill</span>
            <select
              className="input"
              value={value.skill}
              onChange={(e) => set({ skill: e.target.value as PlayerFilters['skill'] })}
              aria-label="Skill"
            >
              <option value="any">Any skill</option>
              <optgroup label="Batting">
                {BATTING_TRAITS.map((t) => (
                  <option key={t} value={t}>
                    {TRAIT_LABEL[t]}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Bowling">
                {BOWLING_TRAITS.map((t) => (
                  <option key={t} value={t}>
                    {TRAIT_LABEL[t]}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="button-row" style={{ marginTop: 14 }}>
            <button onClick={() => onChange(DEFAULT_FILTERS)}>Reset all</button>
            <button className="primary" onClick={() => setOpen(false)}>
              Show {count} players
            </button>
          </div>
        </Sheet>
      )}
    </>
  )
}
