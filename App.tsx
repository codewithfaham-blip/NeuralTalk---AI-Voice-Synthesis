import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, 
  Pause,
  Settings2, 
  History, 
  Share2, 
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
  Info,
  AlertCircle,
  Timer
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

const QUOTA_LIMIT = 10; // Gemini Free Tier Limit (Requests Per Minute)
const WINDOW_MS = 60000; // 60 seconds rolling window

type Tab = 'create' | 'voices' | 'lab' | 'history' | 'settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('create');
  const [text, setText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);
  const [currentAudio, setCurrentAudio] = useState<{ id: string; buffer: AudioBuffer; audioData: Uint8Array; url: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // --- Quota Tracking State ---
  const [genTimestamps, setGenTimestamps] = useState<number[]>([]);
  const [secondsToReset, setSecondsToReset] = useState<number>(0);
  
  // --- Voice Cloning State ---
  const [cloningName, setCloningName] = useState('');
  const [cloningFile, setCloningFile] = useState<File | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloningProgress, setCloningProgress] = useState(0);
  const [cloningStep, setCloningStep] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
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
    const urduPattern = /[\u0600-\u06FF]/;
    return { hasUrdu: urduPattern.test(text) };
  }, [text]);

  // Calculate current quota usage
  const activeQuota = useMemo(() => {
    const now = Date.now();
    return genTimestamps.filter(t => now - t < WINDOW_MS).length;
  }, [genTimestamps]);

  // Handle countdown and quota cleanup
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      
      // Clean up old timestamps
      setGenTimestamps(prev => {
        const filtered = prev.filter(t => now - t < WINDOW_MS);
        
        // Calculate reset time if quota is full
        if (filtered.length >= QUOTA_LIMIT) {
          const oldest = filtered[0];
          const msRemaining = WINDOW_MS - (now - oldest);
          setSecondsToReset(Math.max(0, Math.ceil(msRemaining / 1000)));
        } else {
          setSecondsToReset(0);
        }
        
        return filtered;
      });
    }, 1000); // Check every second for smooth countdown
    
    return () => clearInterval(interval);
  }, []);

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

  const handleShareAudio = async (audioData: Uint8Array, textLabel: string) => {
    const wavBlob = pcmToWav(audioData, 24000);
    const file = new File([wavBlob], `neuraltalk-${Date.now()}.wav`, { type: 'audio/wav' });
    if (navigator.share && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'NeuralTalk Audio', text: `Audio for: "${textLabel.slice(0, 30)}..."` });
      } catch (err) { console.error("Sharing failed", err); }
    } else {
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `neural-voice-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || isGenerating || activeQuota >= QUOTA_LIMIT) return;
    setAppError(null);
    try {
      if (!process.env.API_KEY || process.env.API_KEY.includes('your_')) {
        throw new Error("API Key configuration missing. Please check Vercel environment.");
      }

      setIsGenerating(true);
      const audioData = await generateSpeech(text, selectedVoice, settings);
      
      setGenTimestamps(prev => [...prev, Date.now()]);

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
      console.error("Generation Error:", error);
      if (error.message.includes('429')) {
        setAppError("Quota Full: Aapki limit khatam ho gayi hai.");
      } else {
        setAppError(`Error: ${error.message}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'create':
        return (
          <div className="space-y-6 animate-in fade-in duration-300">
            {activeQuota >= QUOTA_LIMIT && (
              <div className="bg-amber-500/10 border border-amber-500/50 rounded-xl p-4 flex gap-3 items-center animate-pulse">
                <Timer className="text-amber-500 shrink-0" size={20} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-amber-500 leading-tight">Next Slot Available in:</p>
                  <p className="text-xl font-black text-amber-400">{secondsToReset} Seconds</p>
                </div>
              </div>
            )}

            {appError && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 flex gap-3 items-start">
                <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-red-500">Generation Error</p>
                  <p className="text-xs text-red-400/80 mt-1">{appError}</p>
                </div>
                <button onClick={() => setAppError(null)} className="text-red-500/50"><X size={16} /></button>
              </div>
            )}

            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setActiveTab('voices')} className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-full border border-zinc-700 max-w-[60%]">
                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedVoice.name}`} className="w-5 h-5 rounded-full" />
                  <span className="text-xs font-bold truncate">{selectedVoice.name}</span>
                  <ChevronRight size={14} className="text-zinc-500" />
                </button>
                <div className="flex gap-2">
                  {languageProfile.hasUrdu && <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20 uppercase">Urdu</span>}
                  <span className="text-[10px] text-zinc-500 font-bold uppercase">{text.length}/5000</span>
                </div>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                dir={languageProfile.hasUrdu ? "rtl" : "ltr"}
                placeholder={languageProfile.hasUrdu ? "یہاں اردو لکھیں..." : "Type text here..."}
                className={`w-full h-44 bg-transparent text-zinc-100 placeholder:text-zinc-600 focus:outline-none text-lg leading-relaxed resize-none ${languageProfile.hasUrdu ? 'urdu-text' : ''}`}
              />
              <div className="flex gap-3 mt-4">
                <button 
                  onClick={handleGenerate} 
                  disabled={isGenerating || !text.trim() || activeQuota >= QUOTA_LIMIT} 
                  className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-all active:scale-95 ${
                    isGenerating || activeQuota >= QUOTA_LIMIT 
                      ? 'bg-zinc-800 text-zinc-500 border border-zinc-700' 
                      : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                  }`}
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-zinc-600 border-t-indigo-500 rounded-full animate-spin" />
                  ) : activeQuota >= QUOTA_LIMIT ? (
                    <><Timer size={18} /> Wait {secondsToReset}s</>
                  ) : (
                    <><Sparkles size={18} /> Generate Voice</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      case 'voices':
        return (
          <div className="space-y-4 pb-20 animate-in fade-in duration-300">
            <h2 className="text-xl font-bold px-1">Global Voices</h2>
            <div className="grid grid-cols-1 gap-3">
              {allVoices.map(v => (
                <VoiceCard key={v.id} voice={v} isSelected={selectedVoice.id === v.id} onSelect={(v) => { setSelectedVoice(v); setActiveTab('create'); }} />
              ))}
            </div>
          </div>
        );
      case 'lab':
        return (
          <div className="space-y-6 pb-20 animate-in fade-in duration-300">
            <div className="text-center px-4 space-y-2">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center text-indigo-500 mx-auto mb-2"><FlaskConical size={32} /></div>
              <h2 className="text-xl font-bold">Neural Voice Lab</h2>
              <p className="text-sm text-zinc-400">Clone any voice from a 15s recording.</p>
            </div>
            
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6 space-y-6 shadow-xl">
              <input type="text" value={cloningName} onChange={(e) => setCloningName(e.target.value)} placeholder="Voice Name" className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 focus:border-indigo-500 outline-none" />
              
              <div className="grid grid-cols-2 gap-3">
                <button onClick={isRecording ? () => { if(mediaRecorderRef.current) mediaRecorderRef.current.stop(); setIsRecording(false); if(timerRef.current) clearInterval(timerRef.current); } : async () => { setAudioURL(null); setCloningFile(null); try { const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); const mediaRecorder = new MediaRecorder(stream); mediaRecorderRef.current = mediaRecorder; audioChunksRef.current = []; mediaRecorder.ondataavailable = (e) => { if(e.data.size > 0) audioChunksRef.current.push(e.data); }; mediaRecorder.onstop = () => { const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' }); const file = new File([audioBlob], "recorded_voice.wav", { type: 'audio/wav' }); setCloningFile(file); setAudioURL(URL.createObjectURL(audioBlob)); stream.getTracks().forEach(t => t.stop()); }; mediaRecorder.start(); setIsRecording(true); setRecordingTime(0); timerRef.current = window.setInterval(() => setRecordingTime(p => p + 1), 1000); } catch(e) { alert("Mic Access Denied."); } }} className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-2 ${isRecording ? 'bg-red-500/10 border-red-500 animate-pulse' : 'bg-zinc-950/40 border-zinc-800'}`}>
                  {isRecording ? <CircleStop size={32} className="text-red-500" /> : <Mic2 size={32} className="text-zinc-500" />}
                  <span className="text-xs font-bold">{isRecording ? `Recording ${recordingTime}s` : 'Record Now'}</span>
                </button>
                <div className="relative rounded-2xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center p-4 gap-2 bg-zinc-950/40">
                  <Upload size={32} className="text-zinc-500" />
                  <span className="text-xs font-bold truncate w-full text-center">{cloningFile ? cloningFile.name : 'Upload File'}</span>
                  <input type="file" accept="audio/*" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setCloningFile(f); setAudioURL(URL.createObjectURL(f)); }
                  }} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
              </div>

              {audioURL && !isRecording && (
                <div className="bg-zinc-950/60 rounded-xl border border-zinc-800 p-4 flex items-center gap-4">
                  <button onClick={() => { if (labPreviewRef.current) { if (isPreviewPlaying) labPreviewRef.current.pause(); else { labPreviewRef.current.src = audioURL!; labPreviewRef.current.play(); } } }} className="w-10 h-10 flex items-center justify-center bg-indigo-600 rounded-lg text-white">
                    {isPreviewPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full bg-indigo-500 ${isPreviewPlaying ? 'animate-pulse' : ''}`} style={{ width: isPreviewPlaying ? '100%' : '0%', transition: 'width 15s linear' }} />
                  </div>
                </div>
              )}

              {isCloning && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase"><span>{cloningStep}...</span><span>{Math.floor(cloningProgress)}%</span></div>
                  <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${cloningProgress}%` }} /></div>
                </div>
              )}

              <button onClick={async () => { if (!cloningName || !cloningFile) return; setIsCloning(true); setCloningProgress(0); const steps = ["Analyzing", "Mapping", "Cloning", "Saving"]; const interval = setInterval(() => setCloningProgress(p => { const next = Math.min(p + 2.5, 99); const stepIdx = Math.floor((next / 100) * steps.length); setCloningStep(steps[stepIdx]); return next; }), 100); try { const reader = new FileReader(); reader.onload = async (e) => { const base64 = e.target?.result as string; await new Promise(r => setTimeout(r, 1500)); const newVoice: Voice = { id: `custom-${Date.now()}`, name: cloningName, previewUrl: '', category: 'Custom', tags: ['Neural'], geminiVoice: 'Kore', description: 'Personalized voice signature.', isCustom: true, sampleData: base64, sampleMimeType: cloningFile.type }; setCustomVoices(p => [newVoice, ...p]); setSelectedVoice(newVoice); clearInterval(interval); setIsCloning(false); setActiveTab('create'); }; reader.readAsDataURL(cloningFile); } catch (e) { clearInterval(interval); setIsCloning(false); } }} disabled={!cloningName || !cloningFile || isCloning} className="w-full py-4 rounded-xl font-bold bg-indigo-600 text-white disabled:bg-zinc-800 disabled:text-zinc-600 active:scale-95 transition-all">
                {isCloning ? 'Synthesizing Neural Map...' : 'Clone My Voice'}
              </button>
            </div>
          </div>
        );
      case 'history':
        return (
          <div className="space-y-4 pb-20 animate-in fade-in duration-300">
             <div className="flex justify-between items-center px-1">
               <h2 className="text-xl font-bold">Archive</h2>
               <button onClick={() => setHistory([])} className="text-xs text-red-500 font-bold uppercase">Clear All</button>
             </div>
             {history.length === 0 ? <div className="py-20 text-center text-zinc-500"><History size={40} className="mx-auto mb-2 opacity-20" /><p>No history found</p></div> : 
               history.map(item => (
                 <div key={item.id} className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 flex justify-between items-center">
                   <div className="flex-1 min-w-0 pr-4">
                     <p className="text-[10px] font-bold text-zinc-500 uppercase mb-1">{item.voiceName} • {new Date(item.timestamp).toLocaleTimeString()}</p>
                     <p className="text-sm text-zinc-300 truncate italic">"{item.text}"</p>
                   </div>
                   <div className="flex gap-2">
                      <button onClick={async () => { const wavBlob = pcmToWav(item.audioData, 24000); const url = URL.createObjectURL(wavBlob); if (audioInstanceRef.current) { audioInstanceRef.current.src = url; audioInstanceRef.current.play(); } }} className="p-2 bg-zinc-800 rounded-lg text-indigo-400 active:bg-zinc-700 transition-colors"><Play size={16} /></button>
                      <button onClick={() => handleShareAudio(item.audioData, item.text)} className="p-2 bg-zinc-800 rounded-lg text-zinc-400 active:bg-zinc-700 transition-colors"><Share2 size={16} /></button>
                   </div>
                 </div>
               ))
             }
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-8 animate-in fade-in duration-300">
             <h2 className="text-xl font-bold px-1">Studio Configuration</h2>
             <div className="p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800 space-y-6 shadow-2xl">
               <Slider label="Stability" value={settings.stability} min={0} max={100} onChange={v => setSettings({...settings, stability: v})} />
               <Slider label="Clarity" value={settings.similarity} min={0} max={100} onChange={v => setSettings({...settings, similarity: v})} />
               <div className="pt-6 border-t border-zinc-800 flex items-center gap-4">
                 <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center text-indigo-500"><Cpu size={24} /></div>
                 <div><p className="text-[10px] font-bold text-zinc-500 uppercase">Engine Status</p><p className="text-sm font-bold">Neural Core v2.5 Active</p></div>
               </div>
             </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      <header className="px-6 py-4 flex items-center justify-between border-b border-zinc-900 bg-zinc-950/80 backdrop-blur-md z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm shadow-lg shadow-indigo-600/30">NT</div>
          <h1 className="font-bold tracking-tight">NeuralTalk</h1>
        </div>
        
        {/* Real-time Quota Monitor */}
        <div className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 flex items-center gap-1.5 ${
          activeQuota >= QUOTA_LIMIT ? 'bg-red-500 text-white border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
          activeQuota >= 7 ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' :
          'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
        }`}>
          {activeQuota >= QUOTA_LIMIT ? (
            <><Timer size={10} /> Reset in {secondsToReset}s</>
          ) : (
            <>Quota: {activeQuota}/{QUOTA_LIMIT}</>
          )}
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-6 pb-40">
        {renderTab()}
      </main>

      {currentAudio && (
        <div className="fixed bottom-24 left-4 right-4 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-4 flex items-center gap-4 z-40 animate-in slide-in-from-bottom-10">
          <button onClick={() => isPlaying ? audioInstanceRef.current?.pause() : audioInstanceRef.current?.play()} className="p-3 bg-indigo-600 rounded-xl active:scale-95 transition-all shadow-lg shadow-indigo-600/20">
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <div className="flex-1 truncate">
            <p className="text-[10px] font-bold text-indigo-400 uppercase">Processed Signal</p>
            <p className="text-sm font-bold text-zinc-300 truncate">Audio Ready to Play</p>
          </div>
          <button onClick={() => handleShareAudio(currentAudio.audioData, "NeuralTalk Output")} className="p-2 text-zinc-400 hover:text-zinc-200">
            <Share2 size={20} />
          </button>
          <button onClick={() => setCurrentAudio(null)} className="p-2 text-zinc-600 hover:text-zinc-400">
            <X size={20} />
          </button>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900 px-4 py-3 flex justify-around items-center pb-[max(12px,env(safe-area-inset-bottom))] shadow-2xl z-50">
        <NavBtn act={activeTab === 'create'} icon={<Home size={22} />} lab="Studio" onClick={() => setActiveTab('create')} />
        <NavBtn act={activeTab === 'voices'} icon={<Layers size={22} />} lab="Library" onClick={() => setActiveTab('voices')} />
        <NavBtn act={activeTab === 'lab'} icon={<FlaskConical size={22} />} lab="Lab" onClick={() => setActiveTab('lab')} />
        <NavBtn act={activeTab === 'history'} icon={<History size={22} />} lab="Archive" onClick={() => setActiveTab('history')} />
        <NavBtn act={activeTab === 'settings'} icon={<Settings2 size={22} />} lab="Config" onClick={() => setActiveTab('settings')} />
      </nav>
    </div>
  );
};

const NavBtn: React.FC<{ act: boolean; icon: any; lab: string; onClick: () => void }> = ({ act, icon, lab, onClick }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all active:scale-110 ${act ? 'text-indigo-500 scale-105' : 'text-zinc-600 hover:text-zinc-400'}`}>
    {icon}<span className="text-[9px] font-bold uppercase tracking-tight">{lab}</span>
  </button>
);

export default App;
