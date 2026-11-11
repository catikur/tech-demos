import basket from "./careers/basket.ts";
import futbol from "./careers/futbol.ts";
import sap from "./careers/sap.ts";
import siyaset from "./careers/siyaset.ts";
import sokak from "./careers/sokak.ts";
import type { Pack } from "../engine/sim.ts";

// Yeni bir hayat: src/data/careers/ içine bir dosya kopyala,
// id / stats / origins / lifestyles / beats doldur, buraya ekle.
export const PACKS: Pack[] = [futbol, sap, basket, siyaset, sokak];

export function getPack(id: string): Pack | undefined {
  return PACKS.find((pack) => pack.id === id);
}
