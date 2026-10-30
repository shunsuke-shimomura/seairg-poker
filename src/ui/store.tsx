/**
 * 表（戦略）の保管庫。プリセットは presets.json から、ユーザーの表は localStorage から読む。
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Position, Strategy } from '../engine/game';
import { completeStrategy } from '../engine/game';
import presetsJson from '../engine/presets.json';

export interface TableEntry {
  id: string;
  name: string;
  position: Position;
  strategy: Strategy;
  preset: boolean;
  note?: string;
}

const STORAGE_KEY = 'seai-rg-camp.tables.v1';

export const PRESETS: TableEntry[] = presetsJson.tables.map((t) => ({
  id: t.id,
  name: t.name,
  position: t.position as Position,
  strategy: completeStrategy(t.strategy as Record<string, number>),
  preset: true,
  note: t.note,
}));

export const BASE_ID: Record<Position, string> = { 0: 'base-0', 1: 'base-1' };
export const NEAR_EQ_ID: Record<Position, string> = { 0: 'neareq-0', 1: 'neareq-1' };

function loadUserTables(): TableEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TableEntry[];
    return parsed.map((t) => ({ ...t, preset: false, strategy: completeStrategy(t.strategy) }));
  } catch {
    return [];
  }
}

function saveUserTables(tables: TableEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
  } catch {
    // 保存できない環境でも動作は続ける
  }
}

interface Store {
  tables: TableEntry[];
  byId: (id: string) => TableEntry | undefined;
  byPosition: (p: Position) => TableEntry[];
  add: (t: Omit<TableEntry, 'id' | 'preset'>) => TableEntry;
  update: (id: string, patch: Partial<Pick<TableEntry, 'name' | 'strategy' | 'note'>>) => void;
  remove: (id: string) => void;
  importJson: (text: string) => number;
  exportJson: () => string;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<TableEntry[]>(() => loadUserTables());
  useEffect(() => saveUserTables(user), [user]);

  const tables = useMemo(() => [...PRESETS, ...user], [user]);

  const byId = useCallback((id: string) => tables.find((t) => t.id === id), [tables]);
  const byPosition = useCallback((p: Position) => tables.filter((t) => t.position === p), [tables]);

  const add = useCallback<Store['add']>((t) => {
    const entry: TableEntry = {
      ...t,
      id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      preset: false,
      strategy: completeStrategy(t.strategy),
    };
    setUser((prev) => [...prev, entry]);
    return entry;
  }, []);

  const update = useCallback<Store['update']>((id, patch) => {
    setUser((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const remove = useCallback((id: string) => {
    setUser((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const importJson = useCallback((text: string) => {
    const parsed = JSON.parse(text) as { tables?: TableEntry[] } | TableEntry[];
    const list = Array.isArray(parsed) ? parsed : (parsed.tables ?? []);
    const entries: TableEntry[] = list
      .filter((t) => t && (t.position === 0 || t.position === 1) && t.strategy)
      .map((t) => ({
        id: `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: t.name ?? '読み込んだ表',
        position: t.position,
        strategy: completeStrategy(t.strategy),
        preset: false,
        note: t.note,
      }));
    setUser((prev) => [...prev, ...entries]);
    return entries.length;
  }, []);

  const exportJson = useCallback(() => JSON.stringify({ tables: user }, null, 1), [user]);

  const value = useMemo<Store>(
    () => ({ tables, byId, byPosition, add, update, remove, importJson, exportJson }),
    [tables, byId, byPosition, add, update, remove, importJson, exportJson],
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreProvider がありません');
  return s;
}

export const positionLabel = (p: Position) => (p === 0 ? '先手' : '後手');
