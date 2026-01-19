
import React from 'react';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  description?: string;
}

const Slider: React.FC<SliderProps> = ({ label, value, min, max, onChange, description }) => {
  return (
    <div className="space-y-3">
      <div className="flex justify-between items-end">
        <div>
          <label className="block text-sm font-medium text-zinc-300">{label}</label>
          {description && <p className="text-xs text-zinc-500">{description}</p>}
        </div>
        <span className="text-sm font-mono text-indigo-400">{value}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
      />
    </div>
  );
};

export default Slider;
