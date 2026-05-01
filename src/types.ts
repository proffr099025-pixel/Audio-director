export interface AudioVariation {
  label: string;
  voiceDescription: {
    gender: string;
    ageRange: string;
    accent: string;
    pitch: string;
    tempo: string;
    tone: string;
    voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';
  };
  script: string; // SSML or direction cues
  backgroundAudio: {
    genre: string;
    instruments: string[];
    bpm: number;
    energyLevel: string;
    description: string;
  };
  pronunciationGuide: {
    word: string;
    phonetic: string;
  }[];
  directorsNotes: {
    environment: string;
    microphone: string;
    postProduction: string;
    deliveryTips: string;
  };
}

export interface AudioProduction {
  text: string;
  useCase?: string;
  variations: AudioVariation[];
}
