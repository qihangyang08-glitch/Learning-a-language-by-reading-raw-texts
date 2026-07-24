import { create } from 'zustand';

export type DictionaryInitStage = 'idle' | 'checking' | 'importing' | 'done' | 'error';

interface AppStatusState {
  dictionaryStage: DictionaryInitStage;
  dictionaryMessage: string;
  dictionaryProgress: number;
  setDictionaryStatus: (status: {
    stage: DictionaryInitStage;
    message: string;
    progress: number;
  }) => void;
}

export const useAppStatusStore = create<AppStatusState>((set) => ({
  dictionaryStage: 'idle',
  dictionaryMessage: '',
  dictionaryProgress: 0,
  setDictionaryStatus: (status) => set({
    dictionaryStage: status.stage,
    dictionaryMessage: status.message,
    dictionaryProgress: status.progress,
  }),
}));
