let report = (e) => console.error(e);
export const setErrorHandler = (fn) => { report = fn; };
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') node.className = value;
    else if (['value', 'checked', 'disabled', 'selected', 'hidden', 'draggable'].includes(key)) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}
export const run = (fn) => (...args) => Promise.resolve().then(() => fn(...args)).catch(report);
export const button = (label, fn, className = '', attrs = {}) => el('button', { type: 'button', class: className, onclick: run(fn), ...attrs }, label);
export const actions = (...nodes) => el('div', { class: 'actions' }, nodes);
export const hint = (text) => el('p', { class: 'hint' }, text);
export const card = (title, ...nodes) => el('section', { class: 'card' }, el('h2', {}, title), nodes);
export const field = (label, input, help = '') => el('label', { class: 'field' }, label, input, help ? el('small', { class: 'hint' }, help) : null);
export function select(value, options, attrs = {}) {
  return el('select', attrs, options.map(([id, label]) => el('option', { value: id, selected: String(value) === String(id) }, label)));
}
export const row = (content, ...buttons) => el('div', { class: 'row' }, el('div', { class: 'row-main' }, content), actions(buttons));
