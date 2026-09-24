import { useDuckyStoreWithDefault } from "@/store/StoreProvider.js";

export function useIsOfficeMode(): boolean {
  return useDuckyStoreWithDefault((state) => state.interfaceMode === "office", false);
}
