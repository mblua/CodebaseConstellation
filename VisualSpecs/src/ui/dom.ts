// Text reaches the DOM ONLY through `textContent` (§11). There is no `innerHTML`
// anywhere in this application, and an AST-based sink check in the architecture
// test fails the build if one appears — grepping for the string would not be good
// enough, and neither would a promise.

export type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function text(value: string): Text {
  return document.createTextNode(value);
}

export function clear(node: HTMLElement): void {
  while (node.firstChild !== null) node.removeChild(node.firstChild);
}

export function button(
  label: string,
  onClick: () => void,
  attrs: Attrs = {},
): HTMLButtonElement {
  const b = el('button', { type: 'button', ...attrs }, [label]);
  b.addEventListener('click', onClick);
  return b;
}
