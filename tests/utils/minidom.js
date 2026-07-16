export class MiniClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  _fromString(s) { this.set = new Set(String(s || '').split(/\s+/).filter(Boolean)); }
  _sync() { this.el._className = Array.from(this.set).join(' '); }
  add(...names) { names.forEach(n => n && this.set.add(n)); this._sync(); }
  remove(...names) { names.forEach(n => this.set.delete(n)); this._sync(); }
  contains(name) { return this.set.has(name); }
  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.set.has(name) : !!force;
    if (shouldAdd) this.set.add(name); else this.set.delete(name);
    this._sync();
    return shouldAdd;
  }
}

export class MiniElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.attributes = {};
    this.hidden = false;
    this.textContent = '';
    this.eventListeners = {};
    this._className = '';
    this.classList = new MiniClassList(this);
    const props = new Map();
    this.style = {
      setProperty: (k, v) => props.set(k, String(v)),
      getPropertyValue: k => props.get(k) || '',
    };
  }

  get className() { return this._className; }
  set className(value) { this._className = String(value || ''); this.classList._fromString(this._className); }

  set id(value) { this.attributes.id = String(value); }
  get id() { return this.attributes.id || ''; }

  set innerHTML(html) {
    this.children = [];
    const s = String(html || '');
    if (s.includes('dayline') && s.includes('bar')) {
      ['dayline', 'day-label', 'flag', 'bar', 'time'].forEach(cls => {
        const child = new MiniElement('div');
        child.className = cls;
        child.hidden = cls !== 'bar' && cls !== 'time';
        this.appendChild(child);
      });
    } else if (s.includes('tip-time')) {
      ['dot', 'tip-time', 'tip-note', 'tip-price'].forEach(cls => {
        const child = new MiniElement('span');
        child.className = cls;
        this.appendChild(child);
      });
    }
  }

  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...nodes) { nodes.forEach(n => this.appendChild(n)); }
  insertBefore(child, ref) {
    if (child.parentElement) child.remove();
    child.parentElement = this;
    const idx = ref ? this.children.indexOf(ref) : -1;
    if (idx >= 0) this.children.splice(idx, 0, child); else this.children.push(child);
    return child;
  }
  remove() {
    if (!this.parentElement) return;
    const arr = this.parentElement.children;
    const idx = arr.indexOf(this);
    if (idx >= 0) arr.splice(idx, 1);
    this.parentElement = null;
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name]; }
  addEventListener(type, fn) { (this.eventListeners[type] ||= []).push(fn); }
  dispatch(type, event = {}) { (this.eventListeners[type] || []).forEach(fn => fn(event)); }
  getBoundingClientRect() { return { left: 100, top: 80, bottom: 120, width: 20, height: 40 }; }

  matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector === '[data-i18n]') return this.dataset.i18n !== undefined;
    if (selector === '[data-i18n-label]') return this.dataset.i18nLabel !== undefined;
    // General [attr="value"] and [data-xxx="yyy"] support
    const attrEqMatch = selector.match(/^\[([^\]="]+)="([^"]*)"\]$/);
    if (attrEqMatch) {
      const [, attr, val] = attrEqMatch;
      if (attr.startsWith('data-')) {
        const key = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return this.dataset[key] === val;
      }
      return this.getAttribute(attr) === val;
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = node => {
      node.children.forEach(ch => {
        if (ch.matches(selector)) out.push(ch);
        walk(ch);
      });
    };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }
}

export class MiniDocument {
  constructor() {
    this.documentElement = new MiniElement('html');
    this.body = new MiniElement('body');
    this.documentElement.appendChild(this.body);
    this.eventListeners = {};
  }
  createElement(tagName) { return new MiniElement(tagName); }
  querySelector(selector) {
    if (this.documentElement.matches(selector)) return this.documentElement;
    return this.documentElement.querySelector(selector);
  }
  querySelectorAll(selector) {
    const out = this.documentElement.matches(selector) ? [this.documentElement] : [];
    return out.concat(this.documentElement.querySelectorAll(selector));
  }
  getElementById(id) { return this.querySelector('#' + id); }
  addEventListener(type, fn) { (this.eventListeners[type] ||= []).push(fn); }
  dispatch(type, event = {}) { (this.eventListeners[type] || []).forEach(fn => fn(event)); }
}

export function installMiniDom() {
  const doc = new MiniDocument();
  globalThis.document = doc;
  return doc;
}

export function addElement(parent, tag, { id, className, dataset = {} } = {}) {
  const el = new MiniElement(tag);
  if (id) el.id = id;
  if (className) el.className = className;
  Object.assign(el.dataset, dataset);
  parent.appendChild(el);
  return el;
}
