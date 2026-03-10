
import React, { useState } from 'react';
import { User, BookOpen, ArrowRight, Backpack, GraduationCap, School } from 'lucide-react';
import { KidProfile } from '../types';
import { playClick } from '../utils/soundUtils';

interface KidProfileSelectorProps {
  onComplete: (profile: KidProfile) => void;
}

export const KidProfileSelector: React.FC<KidProfileSelectorProps> = ({ onComplete }) => {
  const [ageGroup, setAgeGroup] = useState<KidProfile['ageGroup']>('6-8');
  const [englishLevel, setEnglishLevel] = useState<KidProfile['englishLevel']>('Intermediate');

  const ages: { val: KidProfile['ageGroup']; label: string; desc: string; icon: React.ReactNode }[] = [
    { val: '6-8', label: '6-8 Years', desc: 'Junior Explorer', icon: <Backpack size={24} /> },
    { val: '9-12', label: '9-12 Years', desc: 'Ace Adventurer', icon: <GraduationCap size={24} /> },
  ];

  const levels: { val: KidProfile['englishLevel']; label: string; desc: string; color: string }[] = [
    { val: 'Beginner', label: 'Beginner', desc: 'I know some words', color: 'bg-green-100 border-green-200 text-green-700' },
    { val: 'Intermediate', label: 'Intermediate', desc: 'I read simple sentences', color: 'bg-blue-100 border-blue-200 text-blue-700' },
    { val: 'Advanced', label: 'Advanced', desc: 'I read chapter books', color: 'bg-purple-100 border-purple-200 text-purple-700' },
  ];

  return (
    <div className="h-full w-full overflow-y-auto scrollbar-hide bg-slate-50">
      <div className="min-h-full flex flex-col items-center justify-center p-4 md:p-8 animate-pop-in pb-8">
        
        <div className="text-center mb-8 shrink-0">
          <div className="w-20 h-20 bg-white rounded-full mx-auto mb-4 shadow-sm flex items-center justify-center text-brand-blue">
             <School size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 mb-2">Student Profile</h2>
          <p className="text-base text-slate-500 font-medium">Customize your learning adventure (Age 6-12)</p>
        </div>

        <div className="w-full max-w-sm space-y-8 mb-10">
          {/* Age Section */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 px-1">
              <User size={14} /> Select Age
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {ages.map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => { playClick(); setAgeGroup(opt.val); }}
                  className={`py-4 px-3 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 ${
                    ageGroup === opt.val
                      ? 'border-brand-blue bg-blue-50 text-brand-blue shadow-md scale-[1.02]'
                      : 'border-slate-200 bg-white text-slate-400 hover:border-blue-200 hover:bg-slate-50'
                  }`}
                >
                  <div className={`p-2 rounded-full ${ageGroup === opt.val ? 'bg-brand-blue text-white animate-bounce-slow' : 'bg-slate-100'}`}>
                      {opt.icon}
                  </div>
                  <div>
                    <span className="block font-black text-lg leading-tight">{opt.label}</span>
                    <span className="text-xs font-medium opacity-70">{opt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Level Section */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2 px-1">
              <BookOpen size={14} /> English Level
            </h3>
            <div className="flex flex-col gap-3">
              {levels.map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => { playClick(); setEnglishLevel(opt.val); }}
                  className={`p-4 rounded-2xl border-2 transition-all text-left flex items-center gap-4 ${
                    englishLevel === opt.val
                      ? `${opt.color.replace('bg-', 'bg-opacity-20 ')} border-current shadow-sm ring-1 ring-current`
                      : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-[3px] shrink-0 ${
                      englishLevel === opt.val ? 'border-current bg-current' : 'border-slate-300'
                  }`} />
                  <div>
                      <span className={`block font-bold text-lg leading-none mb-1 ${englishLevel === opt.val ? 'text-slate-800' : 'text-slate-500'}`}>{opt.label}</span>
                      <span className="text-xs font-bold opacity-80">{opt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => { playClick(); onComplete({ ageGroup, englishLevel }); }}
          className="w-full max-w-xs py-5 bg-brand-blue text-white rounded-full font-black text-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 animate-pop-in shrink-0 touch-manipulation"
        >
          Start Adventure <ArrowRight size={24} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};
