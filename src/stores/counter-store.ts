import { create } from "zustand";

type CounterState = {
  count: number;
  increment: () => void;
  reset: () => void;
};

// Client components only; do not read this singleton in server components.
export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set({ count: 0 }),
}));
