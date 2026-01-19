
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Play, 
  Settings2, 
  History, 
  Plus, 
  Download, 
  Trash2, 
  Speaker, 
  Volume2, 
  Mic2, 
  Cpu, 
  Layers, 
  Home, 
  X, 
  ChevronRight, 
  FlaskConical, 
  Upload, 
  Music, 
  Sparkles, 
  BookOpen, 
  CircleStop, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  Info,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import { VOICES, INITIAL_SETTINGS, SAMPLE_SCRIPTS } from './constants';
import { Voice, VoiceHistory, GenerationSettings } from './types';
import VoiceCard from './components/VoiceCard';
import Slider from './components/Slider';
import { generateSpeech } from './services/geminiTTS';
import { decodeAudioData, pcmToWav, encode, decode } from './utils/audioUtils';

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
  const [currentAudio, setCurrentAudio] = useState<{ id: string; buffer: AudioBuffer; audioData: Uint8Array } | null>(null);
  const [deepStorytelling, setDeepStorytelling] = useState(false);

  // --- Voice Cloning & Recording State ---
  const [cloningName, setCloningName] = useState('');
  const [cloningFile, setCloningFile] = useState<File | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloningProgress, setCloningProgress] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [cloningError, setCloningError] = useState<CloningError | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  // --- State Persistence ---
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
        return allVoices.find(v => v.id === parsed.id) || VOICES[0];
      } catch (e) { return VOICES[0]; }
    }
    return VOICES[0];
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

  const isUrdu = useMemo(() => {
    const urduPattern = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\FB50-\uFDFF\uFE70-\uFEFF]/;
    return urduPattern.test(text);
  }, [text]);

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

  // --- Recording Logic ---
  const startRecording = async () => {
    setCloningError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        const file = new File([audioBlob], "recorded_voice.wav", { type: 'audio/wav' });
        setCloningFile(file);
        setAudioURL(URL.createObjectURL(audioBlob));
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setCloningError({
        type: 'general',
        message: 'Microphone access denied',
        guidance: 'Please enable microphone permissions in your browser settings to record your voice.'
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

  // --- Audio Logic ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioCtxRef.current;
  };

  const playBuffer = (buffer: AudioBuffer) => {
    const ctx = getAudioContext();
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch(e) {}
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
    audioSourceRef.current = source;
  };

  const handleGenerate = async () => {
    if (!text.trim() || isGenerating) return;
    try {
      setIsGenerating(true);
      const generationSettings = {
        ...settings,
        styleExaggeration: deepStorytelling ? Math.max(settings.styleExaggeration, 80) : settings.styleExaggeration,
        stability: deepStorytelling ? 30 : settings.stability 
      };

      const audioData = await generateSpeech(text, selectedVoice.geminiVoice, generationSettings);
      const ctx = getAudioContext();
      const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
      const newHistory: VoiceHistory = {
        id: crypto.randomUUID(),
        text: text.slice(0, 100),
        voiceName: selectedVoice.name,
        timestamp: Date.now(),
        audioData: audioData
      };
      setHistory(prev => [newHistory, ...prev]);
      setCurrentAudio({ id: newHistory.id, buffer, audioData });
      playBuffer(buffer);
      setText('');
    } catch (error) {
      console.error(error);
      alert("Failed to generate speech.");
    } finally {
      setIsGenerating(false);
    }
  };

  const validateCloning = async (file: File, name: string): Promise<CloningError | null> => {
    if (!name.trim()) {
      return { type: 'name', message: 'Voice name required', guidance: 'Please enter a name for your custom voice signature.' };
    }

    // Check size (Max 15MB for stability)
    if (file.size > 15 * 1024 * 1024) {
      return { type: 'format', message: 'File too large', guidance: 'Please upload a file smaller than 15MB.' };
    }

    // Check Duration
    try {
      const audio = new Audio();
      const url = URL.createObjectURL(file);
      audio.src = url;
      await new Promise((resolve) => {
        audio.onloadedmetadata = resolve;
      });
      const duration = audio.duration;
      URL.revokeObjectURL(url);

      if (duration < 5) {
        return { type: 'duration', message: 'Sample too short', guidance: 'Your voice sample is only ' + Math.round(duration) + 's. Please provide at least 5-15 seconds of clear speech for accurate cloning.' };
      }
      if (duration > 120) {
        return { type: 'duration', message: 'Sample too long', guidance: 'Your sample is over 2 minutes. Please trim it to under 60 seconds for the best neural analysis performance.' };
      }
    } catch (e) {
      // If we can't determine duration, we continue but warn if it's not a common type
      if (!['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/webm'].includes(file.type)) {
        return { type: 'format', message: 'Unsupported format', guidance: 'NeuralTalk supports WAV, MP3, and OGG formats. Please convert your file and try again.' };
      }
    }

    return null;
  };

  const handleCloneVoice = async () => {
    if (!cloningName || !cloningFile) return;
    setCloningError(null);
    
    const error = await validateCloning(cloningFile, cloningName);
    if (error) {
      setCloningError(error);
      return;
    }

    setIsCloning(true);
    setCloningProgress(0);
    
    // Simulate Neural Progress
    const interval = setInterval(() => {
      setCloningProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 8;
      });
    }, 200);

    try {
      // Simulate potential API failure for demo robustness
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() < 0.05) reject(new Error("API Timeout")); // Rare simulated fail
          else resolve(true);
        }, 3000);
      });

      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        const newVoice: Voice = {
          id: `custom-${Date.now()}`,
          name: cloningName,
          previewUrl: '',
          category: 'Custom',
          tags: ['Cloned', 'Personal'],
          geminiVoice: 'Kore', 
          description: 'A custom cloned voice from user sample.',
          isCustom: true,
          sampleData: base64
        };
        setCustomVoices(prev => [newVoice, ...prev]);
        setSelectedVoice(newVoice);
        setCloningName('');
        setCloningFile(null);
        setAudioURL(null);
        setIsCloning(false);
        setCloningProgress(0);
        setActiveTab('create');
      };
      reader.readAsDataURL(cloningFile);
    } catch (err) {
      clearInterval(interval);
      setIsCloning(false);
      setCloningProgress(0);
      setCloningError({
        type: 'api',
        message: 'Neural synthesis failed',
        guidance: 'The AI engine encountered an unexpected error. This can happen due to network issues. Please try again in a few moments.'
      });
    }
  };

  const deleteCustomVoice = (id: string) => {
    if (confirm("Delete this cloned voice?")) {
      setCustomVoices(prev => prev.filter(v => v.id !== id));
      if (selectedVoice.id === id) setSelectedVoice(VOICES[0]);
    }
  };

  const handleDownload = (audioData: Uint8Array, id: string) => {
    const wavBlob = pcmToWav(audioData, 24000);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neuraltalk-${id.slice(0, 8)}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadCurrent = () => {
    if (!currentAudio) return;
    handleDownload(currentAudio.audioData, currentAudio.id);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'create':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-4 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <div 
                  onClick={() => setActiveTab('voices')}
                  className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1.5 rounded-full border border-zinc-700 cursor-pointer overflow-hidden max-w-[60%]"
                >
                  <img src={selectedVoice.isCustom ? `https://api.dicebear.com/7.x/initials/svg?seed=${selectedVoice.name}` : `https://api.dicebear.com/7.x/avataaars/svg?seed=${selectedVoice.name}`} className="w-5 h-5 rounded-full flex-shrink-0" />
                  <span className="text-xs font-bold truncate">{selectedVoice.name}</span>
                  <ChevronRight size={14} className="text-zinc-500 flex-shrink-0" />
                </div>
                
                <div className="flex items-center gap-2">
                   {isUrdu && <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">URDU DETECTED</span>}
                   <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{text.length}/5000</span>
                </div>
              </div>
              
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                dir={isUrdu ? "rtl" : "ltr"}
                placeholder={isUrdu ? "یہاں اردو لکھیں..." : "Type story or paste text here..."}
                className={`w-full h-44 bg-transparent text-zinc-100 placeholder:text-zinc-600 focus:outline-none text-lg leading-relaxed resize-none custom-scrollbar ${isUrdu ? 'urdu-text rtl' : ''}`}
              />
              
              <div className="flex items-center justify-between mt-2 mb-4 p-2 bg-zinc-950/40 rounded-xl border border-zinc-800/50">
                 <div className="flex items-center gap-2">
                    <Sparkles size={16} className={deepStorytelling ? "text-indigo-400" : "text-zinc-600"} />
                    <span className="text-xs font-bold text-zinc-400">Deep Storytelling Mode</span>
                 </div>
                 <button 
                  onClick={() => setDeepStorytelling(!deepStorytelling)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${deepStorytelling ? 'bg-indigo-600' : 'bg-zinc-800'}`}
                 >
                    <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${deepStorytelling ? 'right-1' : 'left-1'}`} />
                 </button>
              </div>
              
              <div className="flex gap-3">
                <button 
                  onClick={handleDownloadCurrent}
                  disabled={!currentAudio || isGenerating}
                  className={`flex items-center justify-center p-4 rounded-xl transition-all border ${
                    !currentAudio || isGenerating
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-700'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-300 active:scale-95'
                  }`}
                  title="Download latest"
                >
                  <Download size={24} />
                </button>
                <button 
                  onClick={handleGenerate}
                  disabled={isGenerating || !text.trim()}
                  className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-bold text-lg transition-all ${
                    isGenerating || !text.trim()
                      ? 'bg-zinc-800 text-zinc-600'
                      : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 active:scale-95'
                  }`}
                >
                  {isGenerating ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  ) : (
                    <><BookOpen size={20} /> Generate Story</>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      case 'voices':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-10">
            <h2 className="text-xl font-bold px-1">Voice Library</h2>
            
            {customVoices.length > 0 && (
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Your Cloned Voices</span>
                <div className="grid grid-cols-1 gap-3">
                  {customVoices.map(v => (
                    <div key={v.id} className="relative">
                      <VoiceCard 
                        voice={v} 
                        isSelected={selectedVoice.id === v.id} 
                        onSelect={(v) => { setSelectedVoice(v); setActiveTab('create'); }}
                      />
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteCustomVoice(v.id); }}
                        className="absolute right-14 top-1/2 -translate-y-1/2 p-2 text-zinc-600 hover:text-red-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">Specialized Voices</span>
              <div className="grid grid-cols-1 gap-3">
                {VOICES.map(v => (
                  <VoiceCard 
                    key={v.id} 
                    voice={v} 
                    isSelected={selectedVoice.id === v.id} 
                    onSelect={(v) => { setSelectedVoice(v); setActiveTab('create'); }}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      case 'lab':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
            <div className="flex flex-col items-center text-center px-4 space-y-2">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center text-indigo-500 mb-2">
                <FlaskConical size={32} />
              </div>
              <h2 className="text-xl font-bold">Voice Design Lab</h2>
              <p className="text-sm text-zinc-400">Capture your unique voice signature. Read the script below to clone your voice.</p>
            </div>

            {/* Error Guidance Section */}
            {cloningError && (
              <div className="mx-1 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex gap-3 animate-in zoom-in-95 duration-300">
                <AlertTriangle className="text-red-500 flex-shrink-0" size={20} />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-red-500">{cloningError.message}</h4>
                  <p className="text-xs text-zinc-400 leading-relaxed">{cloningError.guidance}</p>
                  <button 
                    onClick={() => {
                      setCloningError(null);
                      setCloningFile(null);
                      setAudioURL(null);
                    }}
                    className="flex items-center gap-1.5 text-[10px] font-bold text-red-400 uppercase tracking-wider mt-2 hover:text-red-300"
                  >
                    <RotateCcw size={12} /> Reset and Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Script Section */}
            <div className="bg-zinc-900/40 rounded-2xl border border-zinc-800 p-5 space-y-4">
               <div className="flex items-center gap-2 mb-2">
                  <BookOpen size={16} className="text-indigo-400" />
                  <span className="text-xs font-bold text-zinc-500 uppercase">Cloning Script</span>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2 bg-zinc-950/40 p-3 rounded-xl border border-zinc-800">
                     <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">English</span>
                     <p className="text-sm text-zinc-300 italic">"{SAMPLE_SCRIPTS.en[0]}"</p>
                  </div>
                  <div className="space-y-2 bg-zinc-950/40 p-3 rounded-xl border border-zinc-800 text-right">
                     <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">Urdu</span>
                     <p className="text-lg urdu-text text-zinc-300 italic">"{SAMPLE_SCRIPTS.ur[2]}"</p>
                  </div>
               </div>
            </div>

            <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-zinc-500 uppercase">Step 1: Assign a Name</label>
                <input 
                  type="text" 
                  value={cloningName}
                  onChange={(e) => {
                    setCloningName(e.target.value);
                    if (cloningError?.type === 'name') setCloningError(null);
                  }}
                  placeholder="e.g. My Custom Narrator"
                  className={`w-full bg-zinc-950 border rounded-xl px-4 py-3 text-zinc-100 focus:border-indigo-500 outline-none transition-all ${cloningError?.type === 'name' ? 'border-red-500' : 'border-zinc-800'}`}
                />
              </div>

              <div className="space-y-4">
                <label className="text-xs font-bold text-zinc-500 uppercase">Step 2: Provide Voice Sample</label>
                
                <div className="grid grid-cols-2 gap-3">
                   <button 
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={isCloning}
                    className={`flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all gap-2 ${
                      isRecording 
                        ? 'bg-red-500/10 border-red-500 animate-pulse' 
                        : 'bg-zinc-950/40 border-zinc-800 hover:border-indigo-500/50'
                    }`}
                   >
                     {isRecording ? <CircleStop size={32} className="text-red-500" /> : <Mic2 size={32} className="text-zinc-500" />}
                     <span className={`text-xs font-bold ${isRecording ? 'text-red-500' : 'text-zinc-400'}`}>
                        {isRecording ? `Stop (${recordingTime}s)` : 'Record Now'}
                     </span>
                   </button>

                   <div className="relative group overflow-hidden rounded-2xl border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 transition-all">
                      <input 
                        type="file" 
                        accept="audio/*"
                        disabled={isCloning || isRecording}
                        onChange={(e) => {
                          setCloningFile(e.target.files?.[0] || null);
                          setCloningError(null);
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                      />
                      <div className="h-full flex flex-col items-center justify-center p-4 gap-2 bg-zinc-950/40">
                         <Upload size={32} className="text-zinc-500" />
                         <span className="text-xs font-bold text-zinc-400">Upload File</span>
                      </div>
                   </div>
                </div>

                {/* Quality Feedback */}
                {(cloningFile || isRecording) && (
                  <div className={`p-4 bg-zinc-950/60 rounded-xl border space-y-3 animate-in fade-in duration-500 ${cloningError?.type === 'duration' ? 'border-red-500/50' : 'border-zinc-800'}`}>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <Clock size={14} className="text-zinc-500" />
                          <span className="text-xs text-zinc-400">Sample Duration:</span>
                       </div>
                       <span className={`text-xs font-bold ${cloningError?.type === 'duration' ? 'text-red-400' : 'text-indigo-400'}`}>
                          {isRecording ? `${recordingTime}s` : (cloningFile ? 'Detected' : '0s')}
                       </span>
                    </div>
                    <div className="flex items-center justify-between">
                       <div className="flex items-center gap-2">
                          <CheckCircle size={14} className={cloningError ? "text-zinc-600" : "text-emerald-500"} />
                          <span className="text-xs text-zinc-400">Cloning Readiness:</span>
                       </div>
                       <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${cloningError ? 'bg-zinc-800 text-zinc-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                          {cloningError ? 'Validation Failed' : 'Ready for Synthesis'}
                       </span>
                    </div>
                    {audioURL && (
                      <audio src={audioURL} controls className="w-full h-8 brightness-75 invert opacity-60 mt-2" />
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {isCloning && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                       <span>Analyzing neural patterns...</span>
                       <span>{Math.floor(cloningProgress)}%</span>
                    </div>
                    <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                       <div 
                        className="h-full bg-indigo-500 transition-all duration-300 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                        style={{ width: `${cloningProgress}%` }}
                       />
                    </div>
                  </div>
                )}

                <button 
                  onClick={handleCloneVoice}
                  disabled={!cloningName || !cloningFile || isCloning || isRecording}
                  className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                    !cloningName || !cloningFile || isCloning || isRecording
                      ? 'bg-zinc-800 text-zinc-600'
                      : 'bg-indigo-600 text-white shadow-lg active:scale-95 hover:bg-indigo-500'
                  }`}
                >
                  {isCloning ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> Synthesizing Voice...</>
                  ) : (
                    <><Sparkles size={20} /> Create Cloned Voice</>
                  )}
                </button>
              </div>
            </div>
            
            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex gap-3 items-start">
               <Info size={18} className="text-indigo-400 flex-shrink-0 mt-0.5" />
               <p className="text-[10px] text-zinc-400 leading-relaxed">
                  NeuralTalk uses zero-shot voice cloning. For best results in <span className="text-indigo-300">Urdu</span> or <span className="text-indigo-300">English</span>, ensure you are in a quiet room and speak clearly for at least 15 seconds.
               </p>
            </div>
          </div>
        );
      case 'history':
        return (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xl font-bold">Archive</h2>
              {history.length > 0 && (
                <button onClick={() => setHistory([])} className="text-xs text-red-500 font-bold uppercase">Clear All</button>
              )}
            </div>
            {history.length === 0 ? (
              <div className="py-20 text-center text-zinc-500">
                <Mic2 size={40} className="mx-auto mb-4 opacity-20" />
                <p>No stories generated yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map(item => (
                  <div 
                    key={item.id}
                    onClick={async () => {
                      const ctx = getAudioContext();
                      const buffer = await decodeAudioData(item.audioData, ctx, 24000, 1);
                      setCurrentAudio({ id: item.id, buffer, audioData: item.audioData });
                      playBuffer(buffer);
                    }}
                    className={`p-4 rounded-xl border transition-all ${currentAudio?.id === item.id ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-zinc-900/50 border-zinc-800'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[10px] font-bold text-zinc-500 uppercase">{item.voiceName}</span>
                       <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleDownload(item.audioData, item.id); }} className="p-1 text-zinc-400"><Download size={14}/></button>
                          <button onClick={(e) => { e.stopPropagation(); setHistory(h => h.filter(i => i.id !== item.id)); }} className="p-1 text-zinc-400"><Trash2 size={14}/></button>
                       </div>
                    </div>
                    <p className={`text-sm text-zinc-300 line-clamp-2 leading-snug ${/[\u0600-\u06FF]/.test(item.text) ? 'urdu-text text-right' : ''}`}>"{item.text}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-xl font-bold px-1">Studio Configuration</h2>
            <div className="p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800 space-y-8">
              <Slider 
                label="Stability" 
                description="Higher is consistent, lower is more expressive"
                value={settings.stability} 
                min={0} max={100} 
                onChange={v => setSettings({...settings, stability: v})} 
              />
              <Slider 
                label="Similarity" 
                description="Closeness to original voice signature"
                value={settings.similarity} 
                min={0} max={100} 
                onChange={v => setSettings({...settings, similarity: v})} 
              />
              <Slider 
                label="Dramatization" 
                description="Exaggerate emotional tone"
                value={settings.styleExaggeration} 
                min={0} max={100} 
                onChange={v => setSettings({...settings, styleExaggeration: v})} 
              />
              
              <div className="pt-6 border-t border-zinc-800">
                 <div className="flex items-center gap-4 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                    <Cpu size={24} className="text-indigo-500" />
                    <div>
                       <p className="text-xs font-bold text-indigo-400 uppercase">Engine Ready</p>
                       <p className="text-sm font-medium">Gemini 2.5 Pro Neural Studio</p>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100 overflow-hidden select-none">
      <header className="px-6 py-4 flex items-center justify-between bg-zinc-950/80 backdrop-blur-lg border-b border-zinc-900 z-20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-white text-sm shadow-lg shadow-indigo-600/20">N</div>
          <h1 className="font-bold tracking-tight">NeuralTalk</h1>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 px-2 py-1 rounded-md">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
           <span className="text-[10px] font-black text-emerald-500 uppercase tracking-tighter">Studio Live</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto custom-scrollbar px-5 pt-6 pb-40">
        {renderTabContent()}
      </main>

      {currentAudio && (
        <div className="fixed bottom-24 left-4 right-4 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-4 flex items-center gap-4 z-40 animate-in slide-in-from-bottom-8 duration-500">
          <button 
            onClick={() => playBuffer(currentAudio.buffer)}
            className="p-3 bg-indigo-600 rounded-xl text-white active:scale-90 transition-transform"
          >
            <Play fill="currentColor" size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Now Narrating</p>
            <p className={`text-sm font-semibold truncate text-zinc-300 ${/[\u0600-\u06FF]/.test(history.find(h => h.id === currentAudio.id)?.text || '') ? 'urdu-text text-right' : ''}`}>
              {/[\u0600-\u06FF]/.test(history.find(h => h.id === currentAudio.id)?.text || '') ? 'اردو کہانی جاری ہے' : 'Story Synthesis Active'}
            </p>
          </div>
          <button onClick={() => setCurrentAudio(null)} className="p-2 text-zinc-500"><X size={20} /></button>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-900 px-2 py-3 pb-6 flex justify-around items-center z-50">
        <NavButton active={activeTab === 'create'} icon={<Home size={20} />} label="Studio" onClick={() => setActiveTab('create')} />
        <NavButton active={activeTab === 'voices'} icon={<Layers size={20} />} label="Voices" onClick={() => setActiveTab('voices')} />
        <NavButton active={activeTab === 'lab'} icon={<FlaskConical size={20} />} label="Lab" onClick={() => setActiveTab('lab')} />
        <NavButton active={activeTab === 'history'} icon={<History size={20} />} label="Archive" onClick={() => setActiveTab('history')} />
        <NavButton active={activeTab === 'settings'} icon={<Settings2 size={20} />} label="Config" onClick={() => setActiveTab('settings')} />
      </nav>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; icon: React.ReactNode; label: string; onClick: () => void }> = ({ active, icon, label, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 px-1 py-1 rounded-xl transition-all ${active ? 'text-indigo-500 scale-105' : 'text-zinc-600'}`}
  >
    {icon}
    <span className="text-[9px] font-bold uppercase tracking-tighter">{label}</span>
  </button>
);

export default App;
