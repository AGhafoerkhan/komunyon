'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { fieldClass } from '@/components/ui';

const SEARCH_URL = 'https://api.pdok.nl/kadaster/location-api/v1/search';
const SUGGEST_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest';
const MIN_QUERY_LENGTH = 1;

interface AddressSuggestion {
  id: string;
  label: string;
  detailUrl?: string;
  selectedValue?: string;
}

interface AddressProperties {
  openbare_ruimte_naam?: unknown;
  huisnummer?: unknown;
  huisletter?: unknown;
  toevoeging?: unknown;
  postcode?: unknown;
  woonplaats_naam?: unknown;
}

type LookupStatus = 'idle' | 'searching' | 'results' | 'empty' | 'error' | 'selected' | 'resolving';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSuggestions(payload: unknown): AddressSuggestion[] {
  if (!isRecord(payload) || !Array.isArray(payload.features)) return [];

  return payload.features.flatMap((feature): AddressSuggestion[] => {
    if (!isRecord(feature) || !isRecord(feature.properties)) return [];
    const { id } = feature;
    const { collection_id: collectionId, display_name: label, href } = feature.properties;
    if (typeof id !== 'string' || collectionId !== 'adres' || typeof label !== 'string' || !Array.isArray(href)) return [];
    if (!/(?:s[’']?-gravenhage|den\s+haag|the\s+hague)/i.test(label)) return [];
    const detailUrl = href.find((candidate): candidate is string => typeof candidate === 'string');
    if (!detailUrl) return [];
    try {
      if (new URL(detailUrl).hostname !== 'api.pdok.nl') return [];
    } catch {
      return [];
    }
    return [{ id, label, detailUrl }];
  });
}

function parseSingleCharacterSuggestions(payload: unknown): AddressSuggestion[] {
  if (!isRecord(payload) || !isRecord(payload.response) || !Array.isArray(payload.response.docs)) return [];

  return payload.response.docs.flatMap((item): AddressSuggestion[] => {
    if (!isRecord(item) || item.type !== 'adres') return [];
    const { id, weergavenaam: label } = item;
    if (typeof id !== 'string' || typeof label !== 'string') return [];
    const selectedValue = label.replace(/,\s*(\d{4})\s?([A-Z]{2})\s+'s-Gravenhage$/i, ', $1 $2, The Hague, Netherlands');
    if (selectedValue === label) return [];
    return [{ id, label, selectedValue }];
  });
}

function formatSelectedAddress(properties: AddressProperties, fallback: string): string {
  const street = typeof properties.openbare_ruimte_naam === 'string' ? properties.openbare_ruimte_naam.trim() : '';
  const number = typeof properties.huisnummer === 'string' || typeof properties.huisnummer === 'number'
    ? String(properties.huisnummer).trim()
    : '';
  const letter = typeof properties.huisletter === 'string' ? properties.huisletter.trim() : '';
  const addition = typeof properties.toevoeging === 'string' ? properties.toevoeging.trim() : '';
  const postcode = typeof properties.postcode === 'string' ? properties.postcode.trim().toUpperCase() : '';
  const town = typeof properties.woonplaats_naam === 'string' ? properties.woonplaats_naam.trim() : '';

  if (!street || !number || !postcode || !town) return fallback;

  const house = `${number}${letter}${addition ? ` ${addition}` : ''}`;
  const formattedPostcode = postcode.replace(/^(\d{4})([A-Z]{2})$/, '$1 $2');
  const formattedTown = /(?:s[’']?-gravenhage|den\s+haag|the\s+hague)/i.test(town) ? 'The Hague' : town;
  const country = formattedTown === 'The Hague' ? ', Netherlands' : '';
  return `${street} ${house}, ${formattedPostcode}, ${formattedTown}${country}`;
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
  const requestId = useRef(0);
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
    const normalized = query.trim();
    if (normalized.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setStatus('idle');
      return;
    }

    const controller = new AbortController();
    const currentRequest = ++requestId.current;
    setStatus('searching');
    setSuggestions([]);
    setActiveIndex(0);

    const timer = window.setTimeout(() => {
      const singleCharacterQuery = normalized.length === 1;
      const url = new URL(singleCharacterQuery ? SUGGEST_URL : SEARCH_URL);
      if (singleCharacterQuery) {
        url.searchParams.set('wt', 'json');
        url.searchParams.set('q', normalized);
        url.searchParams.append('fq', 'type:adres');
        url.searchParams.append('fq', `gemeentenaam:"'s-Gravenhage"`);
        url.searchParams.set('rows', '6');
        url.searchParams.set('sort', 'weergavenaam asc');
      } else {
        url.searchParams.set('q', normalized.slice(0, 120));
        url.searchParams.set('limit', '6');
        url.searchParams.set('f', 'json');
        url.searchParams.set('adres[version]', '1');
      }

      void fetch(url, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`PDOK responded with ${response.status}`);
          return response.json() as Promise<unknown>;
        })
        .then((payload) => {
          if (currentRequest !== requestId.current) return;
          const found = singleCharacterQuery
            ? parseSingleCharacterSuggestions(payload)
            : parseSuggestions(payload);
          setSuggestions(found);
          setStatus(found.length ? 'results' : 'empty');
        })
        .catch(() => {
          if (controller.signal.aborted || currentRequest !== requestId.current) return;
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

  async function chooseAddress(suggestion: AddressSuggestion) {
    if (suggestion.selectedValue) {
      setQuery(suggestion.selectedValue);
      setSearchEnabled(false);
      setStatus('selected');
      onChange(suggestion.selectedValue);
      onSelect(suggestion.selectedValue);
      return;
    }
    if (!suggestion.detailUrl) {
      setStatus('error');
      return;
    }
    setStatus('resolving');
    setSuggestions([]);
    try {
      const response = await fetch(suggestion.detailUrl, { headers: { Accept: 'application/geo+json' } });
      if (!response.ok) throw new Error(`PDOK responded with ${response.status}`);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || !isRecord(payload.properties)) throw new Error('Address details were incomplete.');
      const selected = formatSelectedAddress(payload.properties as AddressProperties, suggestion.label);
      setQuery(selected);
      setSearchEnabled(false);
      setStatus('selected');
      onChange(selected);
      onSelect(selected);
    } catch {
      setStatus('error');
    }
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
      void chooseAddress(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
      setSearchEnabled(false);
    }
  }

  const statusText = status === 'searching'
    ? 'Searching the Dutch address register…'
    : status === 'resolving'
      ? 'Selecting this address…'
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
        disabled={disabled || status === 'resolving'}
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
                onClick={() => void chooseAddress(suggestion)}
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
