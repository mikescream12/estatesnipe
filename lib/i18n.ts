import en from "@/messages/en.json";
import es from "@/messages/es.json";

export type Locale = "en" | "es";
export type Messages = typeof en;

const catalogs: Record<Locale, Messages> = { en, es };

export function getMessages(locale: Locale): Messages {
  return catalogs[locale] ?? catalogs.en;
}

export const CHIP_KEYS = [
  "chipPokemon",
  "chipSports",
  "chipHen",
  "chipChristmas",
  "chipMcm",
  "chipSterling",
] as const;

export type ChipKey = (typeof CHIP_KEYS)[number];

export const CATEGORY_KEYS = [
  "catPokemon",
  "catSports",
  "catJewelry",
  "catMcm",
  "catClothes",
  "catChina",
  "catChristmas",
  "catTools",
  "catVinyl",
  "catToys",
  "catArt",
  "catCoins",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];
