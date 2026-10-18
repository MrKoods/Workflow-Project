// Tiny DOM helpers. No framework.

type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, string>;
  vars?: Record<string, string>; // CSS custom properties, e.g. { '--x': '12%' }
  on?: Partial<Record<keyof HTMLElementEventMap, (e: Event) => void>>;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text != null) el.textContent = props.text;
  for (const [k, v] of Object.entries(props.attrs ?? {})) el.setAttribute(k, v);
  for (const [k, v] of Object.entries(props.vars ?? {}))
    el.style.setProperty(k, v);
  for (const [evt, fn] of Object.entries(props.on ?? {}))
    el.addEventListener(evt, fn);
  for (const c of children) if (c) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: SVGElement[] = [],
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.append(...children);
  return el;
}

/** Restart a CSS animation by toggling a class across a reflow. */
export function replay(el: Element, cls = 'is-on') {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
