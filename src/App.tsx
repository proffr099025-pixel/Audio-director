import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Mic2, 
  Settings2, 
  Play, 
  Copy, 
  Check, 
  Music, 
  Volume2, 
  Info, 
  Sparkles,
  ChevronRight,
  Loader2,
  FileText,
  Radio,
  Headphones,
  Megaphone,
  BookOpen,
  GraduationCap,
  Wind,
  Download,
  Pause,
  FileJson,
  FileDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { generateAudioScripts, textToSpeech } from "./services/gemini";
import { AudioVariation } from "./types";
import { cn } from "./lib/utils";
import { jsPDF } from "jspdf";
import "jspdf-autotable";

const USE_CASES = [
  { id: "general", label: "General", icon: Sparkles },
  { id: "podcast", label: "Podcast Intro", icon: Radio },
  { id: "audiobook", label: "Audiobook", icon: BookOpen },
  { id: "advertisement", label: "Advertisement", icon: Megaphone },
  { id: "meditation", label: "Meditation Guide", icon: Wind },
  { id: "elearning", label: "E-Learning Module", icon: GraduationCap },
  { id: "voiceover", label: "Professional Voiceover", icon: Mic2 },
  { id: "social", label: "Social Media Content", icon: Headphones },
];

export default function App() {
  const [text, setText] = useState("");
  const [useCase, setUseCase] = useState("general");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationTime, setGenerationTime] = useState(0);
  const [variations, setVariations] = useState<AudioVariation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isAudioLoading, setIsAudioLoading] = useState<number | null>(null);
  const [isExportingAudio, setIsExportingAudio] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState<number | null>(null);
  const [selectedVoices, setSelectedVoices] = useState<Record<number, string>>({});
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const handleGenerate = async () => {
    if (!text.trim()) return;
    setIsGenerating(true);
    setError(null);
    setGenerationTime(0);
    
    const timer = setInterval(() => {
      setGenerationTime(prev => prev + 1);
    }, 1000);

    try {
      const result = await generateAudioScripts(text, useCase);
      setVariations(result);
    } catch (err) {
      console.error("Generation failed:", err);
      setError("Production failed. Please check your input or try again later.");
    } finally {
      clearInterval(timer);
      setIsGenerating(false);
    }
  };

  const playAudio = async (variation: AudioVariation, index: number) => {
    if (isPlaying === index) {
      stopAudio();
      return;
    }

    setIsAudioLoading(index);
    try {
      // Clean script for TTS (remove [pause] and <tags>)
      const cleanText = variation.script.replace(/\[.*?\]/g, '').replace(/<.*?>/g, '');
      const voiceToUse = selectedVoices[index] || variation.voiceDescription.voiceName;
      const base64Audio = await textToSpeech(cleanText, voiceToUse);
      
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const arrayBuffer = bytes.buffer;

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      let audioBuffer: AudioBuffer;
      
      try {
        // Try standard decoding first (handles WAV, MP3, etc.)
        // We slice the buffer because decodeAudioData might detach it
        audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer.slice(0));
      } catch (decodeError) {
        console.warn("Standard decoding failed, attempting manual PCM decoding:", decodeError);
        // Fallback to manual PCM 16-bit Little Endian (standard for Gemini TTS)
        try {
          const pcmBuffer = arrayBuffer.byteLength % 2 === 0 ? arrayBuffer : arrayBuffer.slice(0, arrayBuffer.byteLength - 1);
          const int16Array = new Int16Array(pcmBuffer);
          const float32Array = new Float32Array(int16Array.length);
          for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / 32768;
          }
          // Gemini TTS is 24kHz
          audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000);
          audioBuffer.getChannelData(0).set(float32Array);
        } catch (pcmError) {
          console.error("Manual PCM decoding also failed:", pcmError);
          throw new Error("Unable to decode audio data in any supported format.");
        }
      }
      
      stopAudio();
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsPlaying(null);
      source.start();
      
      audioSourceRef.current = source;
      setIsPlaying(index);
    } catch (error) {
      console.error("Audio playback failed:", error);
    } finally {
      setIsAudioLoading(null);
    }
  };

  const stopAudio = () => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setIsPlaying(null);
  };

  const copyToClipboard = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const exportToPDF = (variation: AudioVariation) => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(22);
    doc.setTextColor(255, 68, 68);
    doc.text("AudioDirector AI Production Sheet", 20, 20);
    
    doc.setFontSize(16);
    doc.setTextColor(0, 0, 0);
    doc.text(variation.label, 20, 35);
    
    // Voice Specs
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Voice Specifications:", 20, 50);
    doc.setFont("helvetica", "normal");
    doc.text(`- Gender/Age: ${variation.voiceDescription.gender}, ${variation.voiceDescription.ageRange}`, 25, 58);
    doc.text(`- Accent: ${variation.voiceDescription.accent}`, 25, 65);
    doc.text(`- Tone: ${variation.voiceDescription.tone}`, 25, 72);
    doc.text(`- Voice Model: ${variation.voiceDescription.voiceName}`, 25, 79);
    
    // Audio Environment
    doc.setFont("helvetica", "bold");
    doc.text("Audio Environment:", 20, 95);
    doc.setFont("helvetica", "normal");
    doc.text(`- Genre: ${variation.backgroundAudio.genre}`, 25, 103);
    doc.text(`- BPM: ${variation.backgroundAudio.bpm}`, 25, 110);
    doc.text(`- Instruments: ${variation.backgroundAudio.instruments.join(", ")}`, 25, 117);
    
    // Script
    doc.setFont("helvetica", "bold");
    doc.text("Production Script:", 20, 135);
    doc.setFont("helvetica", "normal");
    const splitScript = doc.splitTextToSize(variation.script, 170);
    doc.text(splitScript, 20, 143);
    
    doc.save(`${variation.label.replace(/\s+/g, '_')}_Production_Sheet.pdf`);
  };

  const exportToJSON = (variation: AudioVariation) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(variation, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${variation.label.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const exportAudio = async (variation: AudioVariation, index: number) => {
    setIsExportingAudio(index);
    try {
      const cleanText = variation.script.replace(/\[.*?\]/g, '').replace(/<.*?>/g, '');
      const voiceToUse = selectedVoices[index] || variation.voiceDescription.voiceName;
      const base64Audio = await textToSpeech(cleanText, voiceToUse);
      
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Gemini TTS returns raw PCM 16-bit 24kHz. 
      // To make it a valid WAV file for download, we should add a WAV header.
      const wavHeader = createWavHeader(bytes.length, 24000);
      const wavBlob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
      const url = URL.createObjectURL(wavBlob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${variation.label.replace(/\s+/g, '_')}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Audio export failed:", error);
      setError("Failed to export audio. Please try again.");
    } finally {
      setIsExportingAudio(null);
    }
  };

  const createWavHeader = (dataLength: number, sampleRate: number) => {
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* file length */
    view.setUint32(4, 36 + dataLength, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, 1, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, 2, true);
    /* bits per sample */
    view.setUint16(34, 16, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, dataLength, true);

    return buffer;
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0B0D]">
      {/* Header */}
      <header className="border-b border-hardware-border bg-hardware-bg/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-hardware-accent flex items-center justify-center glow-red">
              <Mic2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl tracking-tight text-white">AudioDirector <span className="text-hardware-accent">AI</span></h1>
              <p className="hardware-label text-[11px] mt-0.5">Professional Production Suite</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-hardware-border/50 border border-hardware-border">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="hardware-label text-[11px]">System Ready</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-10 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Input Section */}
          <section className="lg:col-span-5 space-y-8">
            <div className="hardware-card p-8 space-y-8 bg-[#1A1C20]">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="hardware-label text-xs">Source Material</Label>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setText("")}
                      className="hardware-label text-[10px] hover:text-hardware-accent transition-colors"
                    >
                      Clear
                    </button>
                    <span className="hardware-label text-[10px] bg-white/5 px-2 py-0.5 rounded">{text.length} chars</span>
                  </div>
                </div>
                <Textarea 
                  placeholder="Paste your text here for professional audio direction..."
                  className="min-h-[350px] bg-black/60 border-hardware-border focus-visible:ring-hardware-accent resize-none font-sans text-base leading-relaxed text-white placeholder:text-hardware-muted/40"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>

              <div className="space-y-5">
                <Label className="hardware-label text-xs">Production Format</Label>
                <div className="grid grid-cols-2 gap-3">
                  {USE_CASES.map((uc) => {
                    const Icon = uc.icon;
                    return (
                      <button
                        key={uc.id}
                        onClick={() => setUseCase(uc.id)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-all group",
                          useCase === uc.id 
                            ? "bg-hardware-accent/15 border-hardware-accent text-hardware-accent" 
                            : "bg-black/30 border-hardware-border text-hardware-muted hover:border-hardware-muted/60 hover:text-white"
                        )}
                      >
                        <Icon className={cn("w-4.5 h-4.5 transition-transform group-hover:scale-110", useCase === uc.id ? "text-hardware-accent" : "text-hardware-muted")} />
                        <span className="text-sm font-semibold">{uc.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button 
                className="w-full bg-hardware-accent hover:bg-hardware-accent/90 text-white font-bold py-7 rounded-xl glow-red transition-all active:scale-[0.98] text-lg"
                disabled={!text.trim() || isGenerating}
                onClick={handleGenerate}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                    Analyzing Content...
                  </>
                ) : (
                  <>
                    <Play className="w-6 h-6 mr-3 fill-current" />
                    Start Production
                  </>
                )}
              </Button>

              {error && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium animate-in fade-in slide-in-from-top-2">
                  {error}
                </div>
              )}
            </div>

            <div className="hardware-card p-5 bg-blue-500/10 border-blue-500/30 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                <Info className="w-6 h-6 text-blue-400" />
              </div>
              <p className="text-xs text-blue-100/80 leading-relaxed">
                Our AI director evaluates emotional resonance, technical terminology, and narrative flow to create broadcast-quality scripts with full SSML markup.
              </p>
            </div>
          </section>

          {/* Output Section */}
          <section className="lg:col-span-7">
            <AnimatePresence mode="wait">
              {isGenerating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center text-center space-y-8 py-24"
                >
                  <div className="relative">
                    <div className="w-24 h-24 rounded-3xl bg-hardware-bg border border-hardware-border flex items-center justify-center shadow-inner">
                      <Loader2 className="w-12 h-12 text-hardware-accent animate-spin" />
                    </div>
                    <div className="absolute -inset-4 bg-hardware-accent/10 rounded-full blur-2xl animate-pulse" />
                  </div>
                  <div className="max-w-md space-y-3">
                    <h3 className="text-2xl font-display font-bold text-white">Directing Production...</h3>
                    <p className="text-base text-hardware-muted leading-relaxed">
                      Our AI director is analyzing your script, selecting voices, and composing the audio environment.
                    </p>
                    {generationTime > 10 && (
                      <p className="text-xs text-hardware-accent animate-pulse">
                        {generationTime > 20 ? "Almost there, finalizing the production..." : "Processing complex instructions..."}
                      </p>
                    )}
                  </div>
                </motion.div>
              ) : variations.length > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -30 }}
                  className="space-y-8"
                >
                  <Tabs defaultValue="v-0" className="w-full">
                    <TabsList className="w-full bg-[#1A1C20] border border-hardware-border p-1.5 h-auto flex-wrap justify-start gap-1">
                      {variations.map((v, i) => (
                        <TabsTrigger 
                          key={i} 
                          value={`v-${i}`}
                          className="data-[state=active]:bg-hardware-accent data-[state=active]:text-white data-[state=active]:tab-active-glow px-6 py-2.5 text-xs font-mono uppercase tracking-widest transition-all"
                        >
                          Var {i + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {variations.map((v, i) => (
                      <TabsContent key={i} value={`v-${i}`} className="mt-8 space-y-8 outline-none">
                        {/* Variation Header */}
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div>
                            <h2 className="text-3xl font-display font-bold text-white tracking-tight">{v.label}</h2>
                            <div className="flex flex-wrap gap-3 mt-3">
                              <Badge variant="outline" className="bg-hardware-accent/20 border-hardware-accent/40 text-hardware-accent text-[11px] px-3 py-0.5 uppercase font-mono tracking-wider">
                                {v.voiceDescription.tone}
                              </Badge>
                              <Badge variant="outline" className="bg-white/5 border-white/15 text-white/80 text-[11px] px-3 py-0.5 uppercase font-mono tracking-wider">
                                {v.voiceDescription.tempo} Tempo
                              </Badge>
                              <Badge variant="outline" className="bg-white/5 border-white/15 text-white/80 text-[11px] px-3 py-0.5 uppercase font-mono tracking-wider">
                                {v.voiceDescription.accent}
                              </Badge>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="border-hardware-border hover:bg-white/10 text-white h-10 px-4 font-mono text-[11px] uppercase tracking-wider"
                              onClick={() => copyToClipboard(v.script, i)}
                            >
                              {copiedIndex === i ? (
                                <Check className="w-4 h-4 mr-2 text-green-500" />
                              ) : (
                                <Copy className="w-4 h-4 mr-2" />
                              )}
                              Copy Script
                            </Button>
                            <Select onValueChange={(val) => {
                              if (val === 'pdf') exportToPDF(v);
                              if (val === 'json') exportToJSON(v);
                              if (val === 'audio') exportAudio(v, i);
                            }}>
                              <SelectTrigger className="w-[140px] border-hardware-border bg-transparent text-white h-10 font-mono text-[11px] uppercase tracking-wider">
                                <FileDown className="w-4 h-4 mr-2" />
                                <SelectValue placeholder="Export" />
                              </SelectTrigger>
                              <SelectContent className="bg-[#1A1C20] border-hardware-border text-white">
                                <SelectItem value="pdf" className="focus:bg-hardware-accent">
                                  <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    <span>PDF Sheet</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="audio" className="focus:bg-hardware-accent" disabled={isExportingAudio !== null}>
                                  <div className="flex items-center gap-2">
                                    {isExportingAudio === i ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                                    <span>Audio (.wav)</span>
                                  </div>
                                </SelectItem>
                                <SelectItem value="json" className="focus:bg-hardware-accent">
                                  <div className="flex items-center gap-2">
                                    <FileJson className="w-4 h-4" />
                                    <span>JSON Data</span>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Audio Preview Section */}
                        <div className="hardware-card p-6 bg-gradient-to-r from-hardware-accent/10 to-transparent border-hardware-accent/30 flex flex-col md:flex-row items-center justify-between gap-6">
                          <div className="flex items-center gap-5 w-full md:w-auto">
                            <div className={cn(
                              "w-14 h-14 rounded-full flex items-center justify-center transition-all shrink-0",
                              isPlaying === i ? "bg-hardware-accent glow-red" : "bg-white/10"
                            )}>
                              {isAudioLoading === i ? (
                                <Loader2 className="w-7 h-7 text-white animate-spin" />
                              ) : isPlaying === i ? (
                                <Pause className="w-7 h-7 text-white fill-current" />
                              ) : (
                                <Play className="w-7 h-7 text-white fill-current ml-1" />
                              )}
                            </div>
                            <div className="flex-1">
                              <h4 className="text-white font-bold text-lg">Voice Preview</h4>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="hardware-label text-[10px]">Model:</span>
                                <Select 
                                  value={selectedVoices[i] || v.voiceDescription.voiceName} 
                                  onValueChange={(val) => setSelectedVoices(prev => ({ ...prev, [i]: val }))}
                                >
                                  <SelectTrigger className="h-7 bg-white/5 border-white/10 text-[11px] font-mono px-2 w-[100px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-[#1A1C20] border-hardware-border text-white">
                                    {['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'].map(voice => (
                                      <SelectItem key={voice} value={voice} className="text-[11px] font-mono focus:bg-hardware-accent">
                                        {voice}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                          <Button 
                            onClick={() => playAudio(v, i)}
                            disabled={isAudioLoading !== null && isAudioLoading !== i}
                            className={cn(
                              "w-full md:w-auto px-8 py-6 rounded-xl font-bold transition-all",
                              isPlaying === i 
                                ? "bg-white/10 text-white hover:bg-white/20" 
                                : "bg-hardware-accent text-white hover:bg-hardware-accent/90 glow-red"
                            )}
                          >
                            {isAudioLoading === i ? "Generating..." : isPlaying === i ? "Stop Preview" : "Generate & Play"}
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Voice Specs */}
                          <Card className="hardware-card border-none shadow-none bg-white/5 p-2">
                            <CardHeader className="pb-4">
                              <div className="flex items-center gap-3">
                                <Mic2 className="w-5 h-5 text-hardware-accent" />
                                <CardTitle className="hardware-label text-xs">Voice Specifications</CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent className="grid grid-cols-2 gap-y-6">
                              <div className="space-y-1.5">
                                <p className="hardware-label text-[10px]">Gender / Age</p>
                                <p className="text-sm font-semibold text-white">{v.voiceDescription.gender}, {v.voiceDescription.ageRange}</p>
                              </div>
                              <div className="space-y-1.5">
                                <p className="hardware-label text-[10px]">Pitch</p>
                                <p className="text-sm font-semibold text-white">{v.voiceDescription.pitch}</p>
                              </div>
                              <div className="space-y-1.5">
                                <p className="hardware-label text-[10px]">Accent</p>
                                <p className="text-sm font-semibold text-white">{v.voiceDescription.accent}</p>
                              </div>
                              <div className="space-y-1.5">
                                <p className="hardware-label text-[10px]">Emotional Tone</p>
                                <p className="text-sm font-semibold text-white">{v.voiceDescription.tone}</p>
                              </div>
                            </CardContent>
                          </Card>

                          {/* Audio Specs */}
                          <Card className="hardware-card border-none shadow-none bg-white/5 p-2">
                            <CardHeader className="pb-4">
                              <div className="flex items-center gap-3">
                                <Music className="w-5 h-5 text-hardware-accent" />
                                <CardTitle className="hardware-label text-xs">Audio Environment</CardTitle>
                              </div>
                            </CardHeader>
                            <CardContent className="space-y-6">
                              <div className="flex items-center justify-between">
                                <div className="space-y-1.5">
                                  <p className="hardware-label text-[10px]">Genre</p>
                                  <p className="text-sm font-semibold text-white">{v.backgroundAudio.genre}</p>
                                </div>
                                <div className="text-right space-y-1.5">
                                  <p className="hardware-label text-[10px]">BPM</p>
                                  <p className="text-sm font-semibold text-white">{v.backgroundAudio.bpm}</p>
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="hardware-label text-[10px]">Instruments</p>
                                <div className="flex flex-wrap gap-2">
                                  {v.backgroundAudio.instruments.map((inst, idx) => (
                                    <span key={idx} className="text-[11px] bg-white/10 px-2.5 py-1 rounded-md text-white font-medium">{inst}</span>
                                  ))}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {/* Script Content */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-hardware-accent" />
                            <h3 className="hardware-label text-xs">Production Script (SSML/Cues)</h3>
                          </div>
                          <div className="hardware-card bg-black/50 p-8 relative group border-hardware-border/50">
                            <ScrollArea className="h-[450px] pr-6">
                              <div className="font-mono text-base leading-relaxed text-white/95 whitespace-pre-wrap selection:bg-hardware-accent/30">
                                {v.script}
                              </div>
                            </ScrollArea>
                          </div>
                        </div>

                        {/* Pronunciation Guide */}
                        {v.pronunciationGuide.length > 0 && (
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <Volume2 className="w-5 h-5 text-hardware-accent" />
                              <h3 className="hardware-label text-xs">Phonetic Pronunciation Guide</h3>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {v.pronunciationGuide.map((item, idx) => (
                                <div key={idx} className="bg-white/5 border border-white/10 p-3 rounded-lg flex flex-col gap-1 hover:border-hardware-accent/30 transition-colors">
                                  <span className="text-sm font-bold text-white">{item.word}</span>
                                  <span className="text-[11px] font-mono text-hardware-accent font-medium">{item.phonetic}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Director's Notes */}
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <Settings2 className="w-5 h-5 text-hardware-accent" />
                            <h3 className="hardware-label text-xs">Director's Notes</h3>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-3">
                              <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                <p className="hardware-label text-[10px] mb-2">Recording Environment</p>
                                <p className="text-sm text-white/90 leading-relaxed">{v.directorsNotes.environment}</p>
                              </div>
                              <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                <p className="hardware-label text-[10px] mb-2">Microphone Recommendation</p>
                                <p className="text-sm text-white/90 leading-relaxed">{v.directorsNotes.microphone}</p>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                <p className="hardware-label text-[10px] mb-2">Post-Production</p>
                                <p className="text-sm text-white/90 leading-relaxed">{v.directorsNotes.postProduction}</p>
                              </div>
                              <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                                <p className="hardware-label text-[10px] mb-2">Delivery Tips</p>
                                <p className="text-sm text-white/90 leading-relaxed">{v.directorsNotes.deliveryTips}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </motion.div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-8 py-24">
                  <div className="w-24 h-24 rounded-3xl bg-hardware-bg border border-hardware-border flex items-center justify-center shadow-inner">
                    <Volume2 className="w-12 h-12 text-hardware-muted/50" />
                  </div>
                  <div className="max-w-md space-y-3">
                    <h3 className="text-2xl font-display font-bold text-white">Production Console Ready</h3>
                    <p className="text-base text-hardware-muted leading-relaxed">
                      Input your script on the left to generate professional audio variations with full technical specifications and AI-powered voice previews.
                    </p>
                  </div>
                  <div className="flex gap-6">
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-hardware-accent glow-red" />
                      <span className="hardware-label text-[9px]">Analyze</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-hardware-accent glow-red" />
                      <span className="hardware-label text-[9px]">Direct</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-hardware-accent glow-red" />
                      <span className="hardware-label text-[9px]">Produce</span>
                    </div>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-hardware-border bg-hardware-bg/50 py-8 mt-auto">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <span className="hardware-label text-[11px]">AudioDirector AI v1.1.0</span>
            <span className="hardware-label text-[11px]">|</span>
            <span className="hardware-label text-[11px] flex items-center gap-2">
              <Sparkles className="w-3 h-3 text-hardware-accent" />
              Gemini 3 Flash Engine
            </span>
          </div>
          <div className="flex items-center gap-8">
            <a href="#" className="hardware-label text-[11px] hover:text-white transition-colors">Documentation</a>
            <a href="#" className="hardware-label text-[11px] hover:text-white transition-colors">System Status</a>
            <a href="#" className="hardware-label text-[11px] hover:text-white transition-colors">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
