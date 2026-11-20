'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { fieldClass } from '@/components/ui';

const SUGGEST_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest';
const THE_HAGUE_TOWN_CODE = '1245';

interface AddressSuggestion {
  id: string;
  label: string;
  selectedValue: string;
}

type LookupStatus = 'idle' | 'searching' | 'results' | 'empty' | 'error' | 'selected';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSuggestions(payload: unknown): AddressSuggestion[] {
  if (!isRecord(payload) || !isRecord(payload.response) || !Array.isArray(payload.response.docs)) return [];

  return payload.response.docs.flatMap((item): AddressSuggestion[] => {
    if (!isRecord(item) || item.type !== 'adres' || item.woonplaatscode !== THE_HAGUE_TOWN_CODE) return [];
    const { id, weergavenaam: label, straatnaam: street, huis_nlt: house, postcode } = item;
    if (typeof id !== 'string' || typeof label !== 'string' || typeof street !== 'string' || typeof house !== 'string') return [];

    const formattedPostcode = typeof postcode === 'string' ? postcode.replace(/^(\d{4})([A-Z]{2})$/, '$1 $2') : '';
    const selectedValue = [`${street} ${house}`, formattedPostcode, 'The Hague', 'Netherlands'].filter(Boolean).join(', ');
    return [{ id, label, selectedValue }];
  });
}

export function AddressLookup({
  value,
  onChange,
  onSelect,
  disabled = false,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelect: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const listboxId = useId();
  const [query, setQuery] = useState(value);
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [status, setStatus] = useState<LookupStatus>('idle');

  useEffect(() => {
    if (value === query) return;
    setQuery(value);
    setSearchEnabled(false);
    setSuggestions([]);
    setStatus('idle');
  }, [query, value]);

  useEffect(() => {
    if (!searchEnabled) return;
    const normalized = query.trim().replace(/,?\s+The Hague(?:,\s*Netherlands)?$/i, ' Den Haag');
    if (!normalized) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    setStatus('searching');
    setSuggestions([]);
    setActiveIndex(0);

    const timer = window.setTimeout(() => {
      const url = new URL(SUGGEST_URL);
      url.searchParams.set('q', normalized.slice(0, 120));
      url.searchParams.set('wt', 'json');
      url.searchParams.append('fq', 'type:adres');
      url.searchParams.append('fq', `woonplaatscode:${THE_HAGUE_TOWN_CODE}`);
      url.searchParams.set('rows', '6');
      url.searchParams.set('fl', 'id,type,weergavenaam,straatnaam,woonplaatscode,huis_nlt,postcode');

      if (/^[a-z]{1,2}$/i.test(normalized)) {
        url.searchParams.append('fq', `straatnaam:${normalized.toLowerCase()}*`);
      }
      if (normalized.length === 1) url.searchParams.set('sort', 'weergavenaam asc');

      void fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`PDOK responded with ${response.status}`);
          return response.json() as Promise<unknown>;
        })
        .then((payload) => {
          if (controller.signal.aborted) return;
          const found = parseSuggestions(payload);
          setSuggestions(found);
          setStatus(found.length ? 'results' : 'empty');
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setStatus('error');
          setSuggestions([]);
        });
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, searchEnabled]);

  function updateAddress(next: string) {
    setQuery(next);
    setSearchEnabled(true);
    setSuggestions([]);
    setStatus('idle');
    onChange(next);
  }

  function chooseAddress({ selectedValue }: AddressSuggestion) {
    setQuery(selectedValue);
    setSearchEnabled(false);
    setSuggestions([]);
    setStatus('selected');
    onChange(selectedValue);
    onSelect(selectedValue);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && suggestions[activeIndex]) {
      event.preventDefault();
      chooseAddress(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
      setSearchEnabled(false);
    }
  }

  const statusText = status === 'searching'
    ? 'Searching the Dutch address register…'
    : status === 'selected'
      ? 'Address selected.'
      : status === 'empty'
        ? 'No matching address found in The Hague. Try a street name, postcode, or house number.'
        : status === 'error'
          ? 'Address search is unavailable right now. Please try again shortly.'
          : status === 'results'
            ? 'Select an address from the results.'
            : '';

  return (
    <div className="relative" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSuggestions([]);
    }}>
      <input
        className={fieldClass}
        id="exact-address"
        name="exactAddress"
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={suggestions.length ? listboxId : undefined}
        aria-expanded={suggestions.length > 0}
        aria-activedescendant={suggestions.length ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-invalid={invalid}
        aria-describedby={`${listboxId}-help`}
        aria-required="true"
        value={query}
        maxLength={180}
        autoComplete="street-address"
        placeholder="Street, postcode, or house number"
        disabled={disabled}
        required
        onChange={(event) => updateAddress(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      {suggestions.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label="Address suggestions" className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-line bg-card py-1 shadow-lg">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id} role="presentation">
              <button
                type="button"
                role="option"
                id={`${listboxId}-option-${index}`}
                aria-selected={activeIndex === index}
                className={`w-full px-3 py-2 text-left text-sm leading-5 transition ${activeIndex === index ? 'bg-sand text-ink' : 'text-ink hover:bg-sand'}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseAddress(suggestion)}
              >
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p id={`${listboxId}-help`} role="status" aria-live="polite" className={`mt-1.5 text-xs leading-relaxed ${status === 'selected' ? 'text-moss' : status === 'empty' || status === 'error' ? 'text-clay' : 'text-muted'}`}>
        {statusText}
      </p>
    </div>
  );
}
