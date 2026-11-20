/** Scrolls to and focuses the first invalid form control in document order. */
export function jumpToFirstInvalidField(form: HTMLFormElement | null): void {
  if (!form) return;

  const target = form.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
  if (!target) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  target.focus({ preventScroll: true });
}
