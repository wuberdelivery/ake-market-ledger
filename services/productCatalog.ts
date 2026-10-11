import type {Language} from '../models/types';
import {getDb} from '../db/database';
import {N_ATLAS_ASR_BASE_URL} from '../voice/config';

export interface MarketCatalogItem {
  id: string;
  names: Record<Language, string>;
  aliases: string[];
  defaultUnit: string;
}

export const LOCAL_MARKET_CATALOG: MarketCatalogItem[] = [
  {
    id: 'beans',
    names: {en: 'Beans', yo: 'Ẹ̀wà', ha: 'Wake', ig: 'Agwa'},
    aliases: ['beans', 'bean', 'ewa', 'ẹ̀wà', 'wake', 'agwa'],
    defaultUnit: 'bag',
  },
  {
    id: 'rice',
    names: {en: 'Rice', yo: 'Ìrẹsì', ha: 'Shinkafa', ig: 'Osikapa'},
    aliases: ['rice', 'iresi', 'ìrẹsì', 'shinkafa', 'osikapa', 'apo iresi'],
    defaultUnit: 'bag',
  },
  {
    id: 'indomie-noodles',
    names: {
      en: 'Indomie noodles',
      yo: 'Indomie noodles',
      ha: 'Indomie noodles',
      ig: 'Indomie noodles',
    },
    aliases: [
      'indomie',
      'indomine',
      'indomi',
      'indomy',
      'noodles',
      'instant noodles',
      'indomie carton',
    ],
    defaultUnit: 'carton',
  },
  {
    id: 'garri',
    names: {en: 'Garri', yo: 'Gàrí', ha: 'Gari', ig: 'Garri'},
    aliases: ['garri', 'gari', 'gàrí'],
    defaultUnit: 'bag',
  },
  {
    id: 'yam',
    names: {en: 'Yam', yo: 'Iṣu', ha: 'Doya', ig: 'Ji'},
    aliases: ['yam', 'isu', 'iṣu', 'doya', 'ji'],
    defaultUnit: 'tuber',
  },
  {
    id: 'maize',
    names: {en: 'Maize', yo: 'Àgbàdo', ha: 'Masara', ig: 'Ọka'},
    aliases: ['maize', 'corn', 'agbado', 'àgbàdo', 'masara', 'oka', 'ọka'],
    defaultUnit: 'bag',
  },
  {
    id: 'cassava',
    names: {en: 'Cassava', yo: 'Ẹ̀gẹ́', ha: 'Rogo', ig: 'Akpụ'},
    aliases: ['cassava', 'ege', 'ẹ̀gẹ́', 'rogo', 'akpu', 'akpụ'],
    defaultUnit: 'bag',
  },
  {
    id: 'palm-oil',
    names: {en: 'Palm oil', yo: 'Epo pupa', ha: 'Manja', ig: 'Mmanụ nkwụ'},
    aliases: ['palm oil', 'epo pupa', 'manja', 'mmanu nkwu'],
    defaultUnit: 'litre',
  },
  {
    id: 'groundnut-oil',
    names: {
      en: 'Groundnut oil',
      yo: 'Epo ilẹ̀',
      ha: 'Man gyada',
      ig: 'Mmanụ ahụekere',
    },
    aliases: ['groundnut oil', 'vegetable oil', 'epo ile', 'man gyada'],
    defaultUnit: 'litre',
  },
  {
    id: 'tomato',
    names: {en: 'Tomatoes', yo: 'Tòmátì', ha: 'Tumatir', ig: 'Tomato'},
    aliases: ['tomato', 'tomatoes', 'tomati', 'tumatir'],
    defaultUnit: 'basket',
  },
  {
    id: 'pepper',
    names: {en: 'Pepper', yo: 'Ata', ha: 'Barkono', ig: 'Ose'},
    aliases: ['pepper', 'ata', 'barkono', 'ose'],
    defaultUnit: 'basket',
  },
  {
    id: 'onion',
    names: {en: 'Onions', yo: 'Àlùbọ́sà', ha: 'Albasa', ig: 'Yabasị'},
    aliases: ['onion', 'onions', 'alubosa', 'àlùbọ́sà', 'albasa', 'yabasi'],
    defaultUnit: 'bag',
  },
  {
    id: 'plantain',
    names: {en: 'Plantain', yo: 'Ọ̀gẹ̀dẹ̀', ha: 'Ayaba', ig: 'Unere'},
    aliases: ['plantain', 'ogede', 'ọ̀gẹ̀dẹ̀', 'ayaba', 'unere'],
    defaultUnit: 'bunch',
  },
  {
    id: 'egg',
    names: {en: 'Eggs', yo: 'Ẹyin', ha: 'Kwai', ig: 'Akwa'},
    aliases: ['egg', 'eggs', 'eyin', 'ẹyin', 'kwai', 'akwa'],
    defaultUnit: 'crate',
  },
  {
    id: 'fish',
    names: {en: 'Fish', yo: 'Ẹja', ha: 'Kifi', ig: 'Azụ'},
    aliases: ['fish', 'eja', 'ẹja', 'kifi', 'azu', 'azụ'],
    defaultUnit: 'carton',
  },
  {
    id: 'chicken',
    names: {en: 'Chicken', yo: 'Adìẹ', ha: 'Kaza', ig: 'Ọkụkọ'},
    aliases: ['chicken', 'adie', 'adìẹ', 'kaza', 'okuko'],
    defaultUnit: 'carton',
  },
  {
    id: 'sugar',
    names: {en: 'Sugar', yo: 'Ṣúgà', ha: 'Sukari', ig: 'Shuga'},
    aliases: ['sugar', 'suga', 'ṣúgà', 'sukari', 'shuga'],
    defaultUnit: 'bag',
  },
  {
    id: 'salt',
    names: {en: 'Salt', yo: 'Iyọ̀', ha: 'Gishiri', ig: 'Nnu'},
    aliases: ['salt', 'iyo', 'iyọ̀', 'gishiri', 'nnu'],
    defaultUnit: 'bag',
  },
  {
    id: 'flour',
    names: {en: 'Flour', yo: 'Ìyẹ̀fun', ha: 'Fulawa', ig: 'Ntụ ọka'},
    aliases: ['flour', 'iyefun', 'ìyẹ̀fun', 'fulawa'],
    defaultUnit: 'bag',
  },
  {
    id: 'milk',
    names: {en: 'Milk', yo: 'Wàrà', ha: 'Madara', ig: 'Mmiri ara'},
    aliases: ['milk', 'wara', 'wàrà', 'madara'],
    defaultUnit: 'carton',
  },
  {
    id: 'bread',
    names: {en: 'Bread', yo: 'Búrẹ́dì', ha: 'Burodi', ig: 'Achịcha'},
    aliases: ['bread', 'buredi', 'búrẹ́dì', 'burodi', 'achicha'],
    defaultUnit: 'loaf',
  },
];

const CACHE_KEY = 'market_catalog_cache_v1';

function validItems(value: unknown): MarketCatalogItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item: any) =>
      item &&
      typeof item.id === 'string' &&
      item.names &&
      typeof item.names.en === 'string' &&
      Array.isArray(item.aliases) &&
      typeof item.defaultUnit === 'string',
  ) as MarketCatalogItem[];
}

function mergeCatalog(
  primary: MarketCatalogItem[],
  fallback: MarketCatalogItem[],
): MarketCatalogItem[] {
  const result = new Map<string, MarketCatalogItem>();
  fallback.forEach(item => result.set(item.id, item));
  primary.forEach(item => result.set(item.id, item));
  return [...result.values()];
}

export function cachedMarketCatalog(): MarketCatalogItem[] {
  try {
    const result = getDb().execute(
      `SELECT value FROM app_settings WHERE key=?`,
      [CACHE_KEY],
    );
    if (!result.rows?.length) return LOCAL_MARKET_CATALOG;
    const cached = validItems(JSON.parse(result.rows.item(0).value));
    return mergeCatalog(cached, LOCAL_MARKET_CATALOG);
  } catch {
    return LOCAL_MARKET_CATALOG;
  }
}

export async function refreshMarketCatalog(): Promise<{
  items: MarketCatalogItem[];
  source: 'ONLINE' | 'OFFLINE';
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const base = N_ATLAS_ASR_BASE_URL.replace(/\/$/, '');
    const response = await fetch(`${base}/api/v1/catalog`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`CATALOG_${response.status}`);
    const body = await response.json();
    const remote = validItems(body?.items);
    if (!remote.length) throw new Error('EMPTY_CATALOG');
    getDb().execute(
      `INSERT INTO app_settings (key,value) VALUES (?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      [CACHE_KEY, JSON.stringify(remote)],
    );
    return {
      items: mergeCatalog(remote, LOCAL_MARKET_CATALOG),
      source: 'ONLINE',
    };
  } catch {
    return {items: cachedMarketCatalog(), source: 'OFFLINE'};
  } finally {
    clearTimeout(timeout);
  }
}

export function catalogDisplayName(
  item: MarketCatalogItem,
  language: Language,
): string {
  return item.names[language] || item.names.en;
}
