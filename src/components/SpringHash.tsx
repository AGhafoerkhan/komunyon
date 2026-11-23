'use client';

import { useEffect } from 'react';

function hashId(): string {
  return decodeURIComponent(window.location.hash.replace(/^#/, ''));
}

export function SpringHash() {
  useEffect(() => {
    let sprung = '';

    function spring() {
      const id = hashId();
      if (!id || id === 'main-content' || sprung === id) return;
      const node = document.getElementById(id);
      if (!node) return;
      sprung = id;
      node.classList.remove('spring-target');
      void node.offsetWidth;
      node.classList.add('spring-target');
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    }

    function onHash() {
      sprung = '';
      spring();
    }

    spring();
    const observer = new MutationObserver(spring);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', onHash);
    return () => {
      observer.disconnect();
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  return null;
}
