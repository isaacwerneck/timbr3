import { SynthSettings } from '../types';

const ANON_ID_KEY = 'timbr3_anon_id';

export type PresetRecord = {
  id: string;
  name: string;
  payload: SynthSettings;
  updatedAt?: string;
};

const getApiBase = () => (import.meta.env.VITE_PRESET_API_BASE as string | undefined)?.trim() || '';

const generateAnonId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getAnonId = () => {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = generateAnonId();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
};

const buildHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Anonymous-Id': getAnonId(),
});

const parseJson = async (response: Response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const listPresets = async (): Promise<PresetRecord[]> => {
  const apiBase = getApiBase();
  if (!apiBase) return [];

  const response = await fetch(`${apiBase}/api/presets`, {
    method: 'GET',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Falha ao listar presets (${response.status})`);
  }

  const data = await parseJson(response);
  if (!Array.isArray(data)) return [];

  return data
    .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string')
    .map((item) => ({
      id: item.id,
      name: item.name,
      payload: item.payload as SynthSettings,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
    }));
};

export const savePreset = async (name: string, payload: SynthSettings): Promise<PresetRecord> => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('VITE_PRESET_API_BASE não configurado.');
  }

  const response = await fetch(`${apiBase}/api/presets`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({ name, payload }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao salvar preset (${response.status})`);
  }

  const data = await parseJson(response);
  if (!data || typeof data.id !== 'string') {
    throw new Error('Resposta inválida ao salvar preset.');
  }

  return {
    id: data.id,
    name: typeof data.name === 'string' ? data.name : name,
    payload: (data.payload as SynthSettings) || payload,
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
};

export const deletePreset = async (id: string): Promise<void> => {
  const apiBase = getApiBase();
  if (!apiBase) {
    throw new Error('VITE_PRESET_API_BASE não configurado.');
  }

  const response = await fetch(`${apiBase}/api/presets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Falha ao excluir preset (${response.status})`);
  }
};
