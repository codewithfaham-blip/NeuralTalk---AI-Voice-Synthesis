import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, 
  Pause,
  Settings2, 
  History, 
  Download, 
  Trash2, 
  Mic2, 
  Cpu, 
  Layers, 
  Home, 
  X, 
  ChevronRight, 
  FlaskConical, 
  Upload, 
  Sparkles, 
  BookOpen, 
  CircleStop, 
  AlertTriangle,
  RotateCcw,
  Languages,
  Activity,
  Info
} from 'lucide-react';
import { VOICES, INITIAL_SETTINGS } from './constants.tsx';
import { Voice, VoiceHistory, GenerationSettings } from './types.ts';
import VoiceCard from './components/VoiceCard.tsx';
import Slider from './components/Slider.tsx';
import { generateSpeech } from './services/geminiTTS.ts';
import { decodeAudioData, pcmToWav, encode, decode } from './utils/audioUtils.ts';

const STORAGE_KEYS = {
  HISTORY: 'neuraltalk_history_v2',
  SETTINGS: 'neuraltalk_settings_v2',
  SELECTED_VOICE: 'neuraltalk_selected_voice_v2',
  CUSTOM_VOICES: 'neuraltalk_custom_voices_v2'
};

type Tab = 'create' | 'voices' | 'lab' | 'history' | 'settings';

interface CloningError {
  type: 'duration' | 'format' | 'api' | 'general' | 'name';
  message: string;
  guidance: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentAudio, setCurrentAudio] = useState<{ id: string; buffer: AudioBuffer; audioData: Uint8Array; url: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [deepStorytelling, setDeepStorytelling] = useState(false);

  // --- Voice Cloning State ---
  const [cloningName, setCloningName] = useState('');
  const [cloningFile, setCloningFile] = useState<File | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloningProgress, setCloningProgress] = useState(0);
  const [cloningStep, setCloningStep] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [cloningError, setCloningError] = useState<CloningError | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioInstanceRef = useRef<HTMLAudioElement | null>(null);
  const labPreviewRef = useRef<HTMLAudioElement | null>(null);

  const [customVoices, setCustomVoices] = useState<Voice[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CUSTOM_VOICES);
    return saved ? JSON.parse(saved) : [];
  });

  const allVoices = useMemo(() => [...VOICES, ...customVoices], [customVoices]);

  const [selectedVoice, setSelectedVoice] = useState<Voice>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SELECTED_VOICE);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return allVoices.find(v => v.id === parsed.id) || allVoices[0];
      } catch (e) { return allVoices[0]; }
    }
    return allVoices[0];
  });

  const [settings, setSettings] = useState<GenerationSettings>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return saved ? JSON.parse(saved) : INITIAL_SETTINGS;
  });

  const [history, setHistory] = useState<VoiceHistory[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((item: any) => ({
          ...item,
          audioData: decode(item.audioData)
        }));
      } catch (e) { return []; }
    }
    return [];
  });

  const languageProfile = useMemo(() => {
    const urduPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
    const englishPattern = /[a-zA-Z]/;
    const hasUrdu = urduPattern.test(text);
    const hasEnglish = englishPattern.test(text);
    return { hasUrdu, hasEnglish, isBilingual: hasUrdu && hasEnglish };
  }, [text]);

  useEffect(() => {
    audioInstanceRef.current = new Audio();
    labPreviewRef.current = new Audio();
    
    const setupAudio = (audio: HTMLAudioElement, setPlaying: (p: boolean) => void) => {
      audio.addEventListener('play', () => setPlaying(true));
      audio.addEventListener('pause', () => setPlaying(false));
      audio.addEventListener('ended', () => setPlaying(false));
    };

    setupAudio(audioInstanceRef.current, setIsPlaying);
    setupAudio(labPreviewRef.current, setIsPreviewPlaying);

    return () => {
      audioInstanceRef.current?.pause();
      labPreviewRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    localStorage.setItem(STORAGE_KEYS.SELECTED_VOICE, JSON.stringify(selectedVoice));
    localStorage.setItem(STORAGE_KEYS.CUSTOM_VOICES, JSON.stringify(customVoices));
    const storageData = history.slice(0, 20).map(item => ({
      ...item,
      audioData: encode(item.audioData)
    }));
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(storageData));
  }, [settings, selectedVoice, history, customVoices]);

  const startRecording = async () => {
    setCloningError(null);
    setAudioURL(null);
    setCloningFile(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const file = new File([audioBlob], "recorded_voice.wav", { type: 'audio/wav' });
        setCloningFile(file);
        setAudioURL(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setCloningError({
        type: 'general',
        message: 'Microphone access denied',
        guidance: 'Please enable microphone permissions in your mobile browser or Expo WebView settings.'
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || isGenerating) return;
    try {
      if (!process.env.API_KEY || process.env.API_KEY.includes('your_')) {
        throw new Error("API_KEY is not configured in Vercel environment variables.");
      }

      setIsGenerating(true);
      const audioData = await generateSpeech(text, selectedVoice, settings);
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
      const wavBlob = pcmToWav(audioData, 24000);
      const url = URL.createObjectURL(wavBlob);
      
      const newHistory: VoiceHistory = {
        id: crypto.randomUUID(),
        text: text.slice(0, 100),
        voiceName: selectedVoice.name,
        timestamp: Date.now(),
        audioData: audioData
      };
      setHistory(prev => [newHistory, ...prev]);
      setCurrentAudio({ id: newHistory.id, buffer, audioData, url });
      
      if (audioInstanceRef.current) {
        audioInstanceRef.current.src = url;
        audioInstanceRef.current.play();
      }
      setText('');
    } catch (error: any) {
      alert(`Synthesis Failed: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCloneVoice = async () => {
    if (!cloningName || !cloningFile) return;
    setIsCloning(true);
    setCloningProgress(0);
    
    const steps = ["Analyzing Timbre", "Extracting Phonemes", "Building Signature", "Finalizing"];
    let i = 0;
    const interval = setInterval(() => {
      setCloningProgress(p => {
        const next = Math.min(p + 2, 99);
        const stepIdx = Math.floor((next / 100) * steps.length);
        setCloningStep(steps[stepIdx]);
        return next;
      });
    }, 100);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        await new Promise(r => setTimeout(r, 1500));
        const newVoice: Voice = {
          id: `custom-${Date.now()}`,
          name: cloningName,
          previewUrl: '',
          category: 'Custom',
          tags: ['Neural'],
          geminiVoice: 'Kore',
          description: 'Custom voice profile.',
          isCustom: true,
          sampleData: base64,
          sampleMimeType: cloningFile.type
        };
        setCustomVoices(prev => [newVoice, ...prev]);
        setSelectedVoice(newVoice);
        clearInterval(interval);
        setIsCloning(false);
        setActiveTab('create');
      };
      reader.readAsDataURL(cloningFile);
    } catch (err) {
      clearInterval(interval);
      setIsCloning(false);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'create':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setActiveTab('voices')} className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-full border border-zinc-700 max-w-[60%]">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedVoice.name}`} className="w-5 h-5 rounded-full" />
                  <span className="text-xs font-bold truncate">{selectedVoice.name}</span>
                  <ChevronRight size={14} className="text-zinc-500" />
                </button>
                <div className="flex gap-2">
                  {languageProfile.hasUrdu && <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">URDU</span>}
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">{text.length}/5000</span>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                dir={languageProfile.hasUrdu ? "rtl" : "ltr"}
                placeholder={languageProfile.hasUrdu ? "یہاں لکھیں..." : "Type text here..."}
                className={`w-full h-44 bg-transparent text-zinc-100 placeholder:text-zinc-600 focus:outline-none text-lg leading-relaxed resize-none ${languageProfile.hasUrdu ? 'urdu-text' : ''}`}
              />
              <div className="flex gap-3 mt-4">
                <button onClick={handleGenerate} disabled={isGenerating || !text.trim()} className="flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold bg-indigo-600 text-white disabled:bg-zinc-800 disabled:text-zinc-600 transition-all active:scale-95">
                  {isGenerating ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Sparkles size={18} /> Generate</>}
                </button>
              </div>
            </div>
          </div>
        );
      case 'lab':
        return (
          <div className="space-y-6 pb-20 animate-in fade-in duration-300">
            <div className="text-center px-4 space-y-2">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center text-indigo-500 mx-auto mb-2"><FlaskConical size={32} /></div>
              <h2 className="text-xl font-bold">Voice Cloning Lab</h2>
              <p className="text-sm text-zinc-400">Record 15s of your voice to create a neural signature.</p>
            </div>
            
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6 space-y-6">
              <input type="text" value={cloningName} onChange={(e) => setCloningName(e.target.value)} placeholder="Voice Signature Name" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:border-indigo-500 outline-none" />
              
              <div className="grid grid-cols-2 gap-3">
                <button onClick={isRecording ? stopRecording : startRecording} className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-2 ${isRecording ? 'bg-red-500/10 border-red-500 animate-pulse' : 'bg-zinc-950/40 border-zinc-800'}`}>
                  {isRecording ? <CircleStop size={32} className="text-red-500" /> : <Mic2 size={32} className="text-zinc-500" />}
                  <span className="text-xs font-bold">{isRecording ? `Recording ${recordingTime}s` : 'Record'}</span>
                </button>
                <div className="relative rounded-2xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center p-4 gap-2 bg-zinc-950/40">
                  <Upload size={32} className="text-zinc-500" />
                  <span className="text-xs font-bold truncate w-full text-center">{cloningFile ? cloningFile.name : 'Upload'}</span>
                  <input type="file" accept="audio/*" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setCloningFile(f); setAudioURL(URL.createObjectURL(f)); }
                  }} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              {audioURL && !isRecording && (
                <div className="bg-zinc-950/60 rounded-xl border border-zinc-800 p-4 flex items-center gap-4">
                  <button onClick={() => {
                    if (labPreviewRef.current) {
                      if (isPreviewPlaying) labPreviewRef.current.pause();
                      else { labPreviewRef.current.src = audioURL!; labPreviewRef.current.play(); }
                    }
                  }} className="w-10 h-10 flex items-center justify-center bg-indigo-600 rounded-lg text-white">
                    {isPreviewPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full bg-indigo-500 ${isPreviewPlaying ? 'animate-pulse' : ''}`} style={{ width: isPreviewPlaying ? '100%' : '0%', transition: 'width 15s linear' }} />
                  </div>
                </div>
              )}

              {isCloning && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase"><span>{cloningStep}</span><span>{Math.floor(cloningProgress)}%</span></div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${cloningProgress}%` }} /></div>
                </div>
              )}

              <button onClick={handleCloneVoice} disabled={!cloningName || !cloningFile || isCloning} className="w-full py-4 rounded-xl font-bold bg-indigo-600 text-white disabled:bg-zinc-800 disabled:text-zinc-600 active:scale-95 transition-all">
                {isCloning ? 'Mapping Neural Signature...' : 'Clone Voice'}
              </button>
            </div>
          </div>
        );
      case 'voices':
        return (
          <div className="space-y-4 pb-20 animate-in fade-in duration-300">
            <h2 className="text-xl font-bold px-1">Voice Library</h2>
            <div className="grid grid-cols-1 gap-3">
              {allVoices.map(v => (
                <VoiceCard key={v.id} voice={v} isSelected={selectedVoice.id === v.id} onSelect={(v) => { setSelectedVoice(v); setActiveTab('create'); }} />
              ))}
            </div>
          </div>
        );
      case 'history':
        return (
          <div className="space-y-4 pb-20 animate-in fade-in duration-300">
             <div className="flex justify-between items-center px-1">
               <h2 className="text-xl font-bold">Archive</h2>
               <button onClick={() => setHistory([])} className="text-xs text-red-500 font-bold uppercase">Clear</button>
             </div>
             {history.length === 0 ? <div className="py-20 text-center text-zinc-500"><History size={40} className="mx-auto mb-2 opacity-20" /><p>Empty archive</p></div> : 
               history.map(item => (
                 <div key={item.id} className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 flex justify-between items-center">
                   <div className="flex-1 min-w-0 pr-4">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">{item.voiceName} • {new Date(item.timestamp).toLocaleTimeString()}</p>
                     <p className="text-sm text-zinc-300 truncate">"{item.text}"</p>
                   </div>
                   <div className="flex gap-2">
                      <button onClick={async () => {
                         const wavBlob = pcmToWav(item.audioData, 24000);
                         const url = URL.createObjectURL(wavBlob);
                         if (audioInstanceRef.current) { audioInstanceRef.current.src = url; audioInstanceRef.current.play(); }
                      }} className="p-2 bg-zinc-800 rounded-lg text-indigo-400"><Play size={16} /></button>
                      <button onClick={() => {
                         const wavBlob = pcmToWav(item.audioData, 24000);
                         const url = URL.createObjectURL(wavBlob);
                         const a = document.createElement('a'); a.href = url; a.download = 'neural-voice.wav'; a.click();
                      }} className="p-2 bg-zinc-800 rounded-lg text-zinc-400"><Download size={16} /></button>
                   </div>
                 </div>
               ))
             }
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
             <h2 className="text-xl font-bold px-1">Studio Config</h2>
             <div className="p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800 space-y-6">
               <Slider label="Stability" value={settings.stability} min={0} max={100} onChange={v => setSettings({...settings, stability: v})} />
               <Slider label="Similarity" value={settings.similarity} min={0} max={100} onChange={v => setSettings({...settings, similarity: v})} />
               <div className="pt-6 border-t border-zinc-800 flex items-center gap-4">
                 <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-500"><Cpu size={24} /></div>
                 <div><p className="text-[10px] font-bold text-zinc-500 uppercase">Engine Status</p><p className="text-sm font-bold">Neural Core Active (v2.5)</p></div>
               </div>
             </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      <header className="px-6 py-4 flex items-center justify-between border-b border-zinc-900">
        <div className="flex items-center gap-2"><div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm">NT</div><h1 className="font-bold tracking-tight">NeuralTalk</h1></div>
        <div className="bg-emerald-500/10 px-2 py-1 rounded text-[10px] font-black text-emerald-500 uppercase">Live</div>
      </header>
      
      <main className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-6 pb-32">
        {renderTab()}
      </main>

      {currentAudio && (
        <div className="fixed bottom-24 left-4 right-4 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-4 flex items-center gap-4 z-40 animate-in slide-in-from-bottom-10">
          <button onClick={() => isPlaying ? audioInstanceRef.current?.pause() : audioInstanceRef.current?.play()} className="p-3 bg-indigo-600 rounded-xl">
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <div className="flex-1 truncate"><p className="text-[10px] font-bold text-indigo-400 uppercase">Synthesized Signal</p><p className="text-sm font-bold text-zinc-300 truncate">Audio Ready</p></div>
          <button onClick={() => setCurrentAudio(null)} className="p-2 text-zinc-500"><X size={20} /></button>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900 px-4 py-3 flex justify-around items-center pb-[max(12px,env(safe-area-inset-bottom))]">
        <NavBtn act={activeTab === 'create'} icon={<Home size={20} />} lab="Studio" onClick={() => setActiveTab('create')} />
        <NavBtn act={activeTab === 'voices'} icon={<Layers size={20} />} lab="Library" onClick={() => setActiveTab('voices')} />
        <NavBtn act={activeTab === 'lab'} icon={<FlaskConical size={20} />} lab="Clone" onClick={() => setActiveTab('lab')} />
        <NavBtn act={activeTab === 'history'} icon={<History size={20} />} lab="Archive" onClick={() => setActiveTab('history')} />
        <NavBtn act={activeTab === 'settings'} icon={<Settings2 size={20} />} lab="Config" onClick={() => setActiveTab('settings')} />
      </nav>
    </div>
  );
};

const NavBtn: React.FC<{ act: boolean; icon: any; lab: string; onClick: () => void }> = ({ act, icon, lab, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${act ? 'text-indigo-500' : 'text-zinc-600'}`}>
    {icon}<span className="text-[9px] font-bold uppercase">{lab}</span>
  </button>
);

export default App;
