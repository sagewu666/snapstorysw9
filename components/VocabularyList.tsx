
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Story, LearnedWord } from '../types';
import { Search, Volume2, X, Grid, Mic, Square, Play, Languages, Eye, EyeOff } from 'lucide-react';
import { audioManager } from '../services/audioManager';
import { playClick, playPop, playPing } from '../utils/soundUtils';

interface VocabularyListProps {
  stories: Story[];
}

export const VocabularyList: React.FC<VocabularyListProps> = ({ stories }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCard, setSelectedCard] = useState<LearnedWord | null>(null);
  
  // State for Bilingual Reveal - Default FALSE (English Only)
  const [showChinese, setShowChinese] = useState(false);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const userAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Extract unique words from all stories
  const allWords = useMemo(() => {
    const uniqueWords: LearnedWord[] = [];
    const seenIds = new Set();
    
    stories.forEach(story => {
      if (story.learnedWords) {
        story.learnedWords.forEach(word => {
          // Deduplicate based on word text to show unique vocab
          const key = word.word.toLowerCase();
          if (!seenIds.has(key)) {
            uniqueWords.push(word);
            seenIds.add(key);
          }
        });
      }
    });
    // Sort alphabetically
    return uniqueWords.sort((a, b) => a.word.localeCompare(b.word));
  }, [stories]);

  const filteredWords = allWords.filter(w => 
    w.word.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.wordCN && w.wordCN.includes(searchTerm))
  );

  // Cleanup on unmount or modal close
  useEffect(() => {
      return () => {
          if (userAudioUrl) {
              URL.revokeObjectURL(userAudioUrl);
          }
          stopRecordingStreams();
      };
  }, [selectedCard]); // Reset when card changes

  const stopRecordingStreams = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
  };

  const handleCardClick = (word: LearnedWord) => {
      playPop(); // OPEN CARD
      setSelectedCard(word);
      setShowChinese(false); // Default to Hidden (English Only)
      // Reset recording state
      setUserAudioUrl(null);
      setIsRecording(false);
      setIsPlayingUserAudio(false);
      audioManager.speak(word.word);
  };

  const handleCloseCard = () => {
      playClick(); // CLOSE CARD
      setSelectedCard(null);
      // Explicitly reset audio on close
      setUserAudioUrl(null);
      setIsRecording(false);
      setIsPlayingUserAudio(false);
  };

  // --- RECORDING LOGIC ---

  const startRecording = async () => {
      try {
          audioManager.stopAll(); // Silence AI voice
          playClick();
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const mediaRecorder = new MediaRecorder(stream);
          mediaRecorderRef.current = mediaRecorder;
          audioChunksRef.current = [];

          mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                  audioChunksRef.current.push(event.data);
              }
          };

          mediaRecorder.onstop = () => {
              const mimeType = mediaRecorder.mimeType || '';
              const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
              const url = URL.createObjectURL(audioBlob);
              setUserAudioUrl(url);
              
              // AUTO PLAYBACK
              setTimeout(() => playUserAudio(url), 100);
          };

          mediaRecorder.start();
          setIsRecording(true);
      } catch (err) {
          console.error("Error accessing microphone:", err);
          alert("We need microphone permission to record your voice!");
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          playPing();
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          stopRecordingStreams();
      }
  };

  const playUserAudio = (urlToPlay?: string) => {
      const url = urlToPlay || userAudioUrl;
      if (!url) return;
      
      audioManager.stopAll();

      if (userAudioElementRef.current) {
          userAudioElementRef.current.pause();
          userAudioElementRef.current = null;
      }

      const audio = new Audio(url);
      userAudioElementRef.current = audio;
      
      setIsPlayingUserAudio(true);
      audio.onended = () => setIsPlayingUserAudio(false);
      
      const playPromise = audio.play();
      if (playPromise !== undefined) {
          playPromise.catch(e => {
              console.error("User Audio Playback Error", e);
              setIsPlayingUserAudio(false);
          });
      }
  };

  return (
    <div className="h-full flex flex-col bg-slate-50 relative overflow-hidden">
        {/* Header */}
        <div className="p-6 md:p-8 bg-white border-b border-slate-100 flex flex-col gap-4 shrink-0 shadow-sm z-10">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl md:text-4xl font-black text-brand-blue flex items-center gap-3">
                        <div className="w-12 h-12 bg-pink-100 rounded-2xl rotate-3 flex items-center justify-center text-pink-500 shadow-sm border-2 border-pink-200">
                            <Grid size={28} strokeWidth={3} />
                        </div>
                        Word Cards
                    </h2>
                    <p className="text-slate-500 font-medium pl-1">Your collection: {allWords.length} words</p>
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
                <input 
                    type="text" 
                    placeholder="Search your words..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-brand-blue/20 transition-all"
                />
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-24 scrollbar-hide">
            {allWords.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center opacity-60 mt-10">
                    <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                        <Search size={40} className="text-slate-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-400 mb-2">No Words Yet</h3>
                    <p className="text-slate-400 max-w-xs mx-auto">Go on a Camera Quest to find new words!</p>
                </div>
            ) : filteredWords.length === 0 ? (
                <div className="text-center text-slate-400 mt-10 font-bold">No words match "{searchTerm}"</div>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {filteredWords.map((word) => (
                        <button 
                            key={word.id}
                            onClick={() => handleCardClick(word)}
                            className="bg-white p-3 rounded-2xl shadow-sm border-2 border-slate-100 hover:border-pink-300 hover:shadow-md hover:-translate-y-1 transition-all flex flex-col items-center gap-2 group"
                        >
                            <div className="w-full aspect-square bg-slate-50 rounded-xl overflow-hidden relative">
                                <img src={word.imageUrl} alt={word.word} className="w-full h-full object-cover" />
                            </div>
                            <div className="text-center w-full">
                                <h3 className="font-black text-slate-800 text-lg truncate capitalize">{word.word}</h3>
                                {/* In list view, always clean English */}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>

        {/* Word Detail Modal */}
        {selectedCard && (
            <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-pop-in">
                <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl relative border-8 border-white ring-4 ring-pink-300 flex flex-col overflow-hidden max-h-[90vh]">
                    
                    <button onClick={handleCloseCard} className="absolute top-4 right-4 bg-slate-100 p-2 rounded-full hover:bg-slate-200 z-10 text-slate-500">
                        <X size={20} />
                    </button>

                    <div className="h-60 bg-slate-100 relative shrink-0">
                        <img src={selectedCard.imageUrl} className="w-full h-full object-cover" alt={selectedCard.word} />
                        <button 
                            onClick={(e) => { e.stopPropagation(); audioManager.speak(selectedCard.word); }}
                            className="absolute bottom-4 right-4 p-3 bg-white rounded-full text-brand-blue shadow-lg hover:scale-110 transition-transform"
                        >
                            <Volume2 size={24} />
                        </button>
                    </div>

                    <div className="p-6 bg-white flex flex-col items-center flex-1 overflow-y-auto">
                        
                        {/* Word Section - Bilingual Stacked */}
                        <div className="text-center w-full mb-6">
                            <h2 className="text-4xl font-black text-slate-800 capitalize tracking-tight leading-none mb-1">{selectedCard.word}</h2>
                            {showChinese && selectedCard.wordCN && (
                                <p className="text-2xl font-bold text-brand-blue animate-pop-in mt-1">{selectedCard.wordCN}</p>
                            )}
                        </div>

                        {/* Translation Control */}
                        <div className="w-full flex justify-center mb-6">
                            <button 
                                onClick={() => { playClick(); setShowChinese(prev => !prev); }}
                                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all border shadow-sm active:scale-95 ${showChinese ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-brand-blue text-white border-brand-blue hover:bg-blue-600'}`}
                            >
                                {showChinese ? <EyeOff size={18} /> : <Eye size={18} />}
                                {showChinese ? 'Hide Translation' : 'Show Translation'}
                            </button>
                        </div>

                        {/* Definition Section - Bilingual Stacked */}
                        <div className="bg-pink-50 p-5 rounded-2xl border border-pink-100 w-full mb-6 text-left shadow-sm">
                            <div className="mb-2">
                                <span className="text-xs font-bold text-pink-400 uppercase tracking-wider mb-1 block">Meaning</span>
                                <p className="text-slate-800 font-medium text-lg leading-relaxed">
                                    {selectedCard.definition}
                                </p>
                            </div>
                            
                            {showChinese && selectedCard.definitionCN && (
                                <div className="pt-3 border-t border-pink-200 mt-2 animate-pop-in">
                                    <p className="text-slate-600 font-medium text-lg leading-relaxed">
                                        {selectedCard.definitionCN}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Fun Fact */}
                        {selectedCard.funFact && (
                            <div className="w-full bg-yellow-50 p-3 rounded-xl border border-yellow-200 text-sm text-slate-600 font-medium flex gap-2 items-start mb-6">
                                <span>💡</span>
                                <span>{selectedCard.funFact}</span>
                            </div>
                        )}

                        {/* Voice Studio */}
                        <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 rounded-2xl border border-slate-200 w-full justify-center mt-auto">
                             {isRecording ? (
                                 <button onClick={stopRecording} className="w-12 h-12 bg-red-500 rounded-xl text-white animate-pulse flex items-center justify-center shadow-md"><Square size={18} fill="currentColor" /></button>
                             ) : (
                                 <button onClick={startRecording} className="w-12 h-12 bg-white rounded-xl text-red-500 border-2 border-red-100 flex items-center justify-center hover:bg-red-50 shadow-sm"><Mic size={24} /></button>
                             )}
                             
                             <div className="flex flex-col items-start px-2 flex-1">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Voice Studio</span>
                                 <span className="text-sm font-bold text-slate-700 truncate w-full text-left">
                                     {isRecording ? "Recording..." : userAudioUrl ? "Tap Play to Listen" : "Tap Mic to Practice"}
                                 </span>
                             </div>

                             {userAudioUrl && !isRecording && (
                                 <button onClick={() => playUserAudio()} className={`w-10 h-10 rounded-full text-white flex items-center justify-center shadow-md ${isPlayingUserAudio ? 'bg-brand-blue' : 'bg-blue-300'}`}>
                                     {isPlayingUserAudio ? <Volume2 size={16} /> : <Play size={16} fill="currentColor" />}
                                 </button>
                             )}
                        </div>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};
