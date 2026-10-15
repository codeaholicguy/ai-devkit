'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  REGISTRY_PAGE_SIZE,
  getCachedRegistry,
  getSavedFilters,
  loadRegistry,
  markOpenedFromList,
  registrySkillHref,
  saveFilters,
  type RegistrySkill,
} from '@/lib/skills/registry-client';

type Status = 'loading' | 'ready' | 'error';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function RegistryBrowser() {
  // Start from the in-memory cache so coming back from a skill page renders the
  // same results at once, which lets the browser restore the scroll position.
  const [skills, setSkills] = useState<RegistrySkill[]>(() => getCachedRegistry() ?? []);
  const [status, setStatus] = useState<Status>(() => (getCachedRegistry() ? 'ready' : 'loading'));
  const [query, setQuery] = useState(() => getSavedFilters().query);
  const [registry, setRegistry] = useState(() => getSavedFilters().registry);
  const [limit, setLimit] = useState(() => getSavedFilters().limit);
  const debouncedQuery = useDebounce(query, 200);

  const load = useCallback(() => {
    loadRegistry()
      .then((data) => {
        setSkills(data);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    saveFilters({ query, registry, limit });
  }, [query, registry, limit]);

  const registries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skills) counts.set(skill.registry, (counts.get(skill.registry) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [skills]);

  const results = useMemo(() => {
    const term = debouncedQuery.trim().toLowerCase();
    return skills.filter(
      (skill) =>
        (!registry || skill.registry === registry) &&
        (!term ||
          skill.name.toLowerCase().includes(term) ||
          skill.description.toLowerCase().includes(term)),
    );
  }, [skills, debouncedQuery, registry]);

  const resetFilters = () => {
    setQuery('');
    setRegistry('');
    setLimit(REGISTRY_PAGE_SIZE);
  };

  const visible = results.slice(0, limit);
  const filtered = Boolean(debouncedQuery.trim() || registry);

  return (
    <div className="registry">
      <div className="registry-controls">
        <label className="registry-search">
          <span className="sr-only">Search skills</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(REGISTRY_PAGE_SIZE);
            }}
            placeholder="Search skills by name or description…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="registry-filter">
          <span className="sr-only">Filter by registry</span>
          <select
            value={registry}
            onChange={(event) => {
              setRegistry(event.target.value);
              setLimit(REGISTRY_PAGE_SIZE);
            }}
            disabled={status !== 'ready'}
          >
            <option value="">All registries</option>
            {registries.map(([name, count]) => (
              <option key={name} value={name}>
                {name} ({count.toLocaleString('en-US')})
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="registry-status" role="status">
        {status === 'loading' && 'Loading the registry…'}
        {status === 'ready' &&
          (filtered
            ? `${results.length.toLocaleString('en-US')} of ${skills.length.toLocaleString('en-US')} skills match`
            : `${skills.length.toLocaleString('en-US')} skills from ${registries.length.toLocaleString('en-US')} registries`)}
      </p>

      {status === 'error' && (
        <div className="registry-message">
          <p>{`Couldn't load the registry. Check your connection and try again.`}</p>
          <button
            type="button"
            className="docs-button"
            onClick={() => {
              setStatus('loading');
              load();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && results.length === 0 && (
        <div className="registry-message">
          <p>No skills match “{debouncedQuery.trim() || registry}”.</p>
          <button type="button" className="registry-link-button" onClick={resetFilters}>
            Clear search
          </button>
        </div>
      )}

      {status === 'ready' && results.length > 0 && (
        <>
          <div className="registry-table">
            <div className="registry-head" aria-hidden="true">
              <span>Skill</span>
              <span>Description</span>
              <span>Registry</span>
            </div>
            <ul className="registry-rows">
              {visible.map((skill) => (
                <li key={`${skill.registry}/${skill.path}`} className="registry-row">
                  <Link
                    href={registrySkillHref(skill)}
                    prefetch={false}
                    className="registry-row-name"
                    onClick={() => markOpenedFromList(true)}
                  >
                    {skill.name}
                  </Link>
                  <span className="registry-row-desc">{skill.description}</span>
                  <span className="registry-row-registry">{skill.registry}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="registry-more">
            {results.length > limit && (
              <button
                type="button"
                className="registry-more-button"
                onClick={() => setLimit((current) => current + REGISTRY_PAGE_SIZE)}
              >
                Show {Math.min(REGISTRY_PAGE_SIZE, results.length - limit)} more
              </button>
            )}
            <span>
              Showing {visible.length.toLocaleString('en-US')} of {results.length.toLocaleString('en-US')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
