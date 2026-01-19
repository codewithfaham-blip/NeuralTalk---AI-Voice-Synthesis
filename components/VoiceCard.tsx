
import React from 'react';
import { Voice } from '../types';
import { Play, CheckCircle2 } from 'lucide-react';

interface VoiceCardProps {
  voice: Voice;
  isSelected: boolean;
  onSelect: (voice: Voice) => void;
}

const VoiceCard: React.FC<VoiceCardProps> = ({ voice, isSelected, onSelect }) => {
  return (
    <div 
      onClick={() => onSelect(voice)}
      className={`relative flex items-center gap-3 p-4 rounded-2xl cursor-pointer transition-all border active:scale-[0.98] ${
        isSelected 
          ? 'bg-indigo-600/10 border-indigo-500 ring-1 ring-indigo-500/50' 
          : 'bg-zinc-900 border-zinc-800'
      }`}
    >
      <div className="relative">
        <img 
          src={voice.isCustom ? `https://api.dicebear.com/7.x/initials/svg?seed=${voice.name}` : `https://api.dicebear.com/7.x/avataaars/svg?seed=${voice.name}`}
          alt={voice.name} 
          className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 object-cover"
        />
        {voice.isCustom && (
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-indigo-500 rounded-full border-2 border-zinc-900" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-zinc-100 truncate text-sm">{voice.name}</h3>
          {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-500 flex-shrink-0 ml-1" />}
        </div>
        <div className="flex gap-2 mt-1">
          <span className={`text-[8px] px-1 py-0.5 rounded font-bold uppercase ${voice.isCustom ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-500'}`}>
            {voice.category}
          </span>
          {voice.tags.slice(0, 1).map(tag => (
            <span key={tag} className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-600 font-bold uppercase">
              {tag}
            </span>
          ))}
        </div>
      </div>
      
      {!isSelected && (
        <div className="p-2 text-zinc-700">
           <Play size={14} fill="currentColor" />
        </div>
      )}
    </div>
  );
};

export default VoiceCard;
