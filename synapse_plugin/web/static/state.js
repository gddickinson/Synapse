// Current table and result, shared by the Analyse and Simulate pages (kept while you move between pages).
import { api } from './core.js';
import { parseTable } from './table.js';

export const state = { text: null, table: null, label: '', kind: null, result: null, python: null, demoPython: null };

export const getInfo = () => api('/info');

export async function loadDemo() {
  const d = await api('/demo');
  setTable(d.text, `Demo table: synthetic, made by simulate.py (seed ${d.sim_params.seed}); not real data`, 'demo');
  state.demoPython = d.python;
  state.demoParams = d.params;
  return d;
}

export function setTable(text, label, kind) {
  const table = parseTable(text);  // throws a readable error for a bad file
  Object.assign(state, { text, table, label, kind, result: null, python: null });
  return table;
}
