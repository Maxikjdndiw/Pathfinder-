/** FAQ accordion: one answer open at a time, buttons with aria-expanded and aria-controls. */
import './faq.css';

export function initFaq(list: HTMLElement): void {
  const items = [...list.querySelectorAll<HTMLElement>('.faq__item')];
  const set = (item: HTMLElement, open: boolean) => {
    item.classList.toggle('is-open', open);
    item.querySelector('.faq__q')!.setAttribute('aria-expanded', String(open));
  };
  items.forEach((item) => {
    set(item, false);
    item.querySelector('.faq__q')!.addEventListener('click', () => {
      const open = !item.classList.contains('is-open');
      items.forEach((other) => set(other, other === item && open));
    });
  });
  list.classList.add('is-ready');
}
