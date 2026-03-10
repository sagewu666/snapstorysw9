
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Story, LearnedWord, KidProfile } from '../types';
import { ChevronLeft, ChevronRight, CheckCircle, Sparkles, Volume2, Maximize2, X, Trophy, Star, Loader2, Pause, Play, BookOpen, Plus, Heart, Image as ImageIcon, Mic, Square, RotateCw, Search, Languages, Eye, EyeOff } from 'lucide-react';
import { generateSpeech, lookupWordDefinition, generateIllustration } from '../services/geminiService';
import { playClick, playSuccess, playError, playPop, playPageTurn, playFanfare, playPing, playToggle, playMagic } from '../utils/soundUtils';
import { audioManager } from '../services/audioManager';
import confetti from 'canvas-confetti';

interface StoryBookProps {
  story: Story;
  onFinish: () => void;
  kidProfile: KidProfile;
  onWordAdded: (word: LearnedWord) => void;
}

export const StoryBook: React.FC<StoryBookProps> = ({ story, onFinish, kidProfile, onWordAdded }) => {
  const [currentPage, setCurrentPage] = useState(0);
  
  // Local state to track Learned Words dynamically (includes newly added ones)
  const [localLearnedWords, setLocalLearnedWords] = useState<LearnedWord[]>(story.learnedWords || []);

  // Audio States
  const [isPlayingStoryteller, setIsPlayingStoryteller] = useState(false);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false); 

  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [starCount, setStarCount] = useState(0);
  const [earnedStarWords, setEarnedStarWords] = useState<Set<string>>(new Set());
  
  // Modal State
  const [selectedWordData, setSelectedWordData] = useState<LearnedWord | null>(null);
  
  // Language State - Default to showing translation
  const [showChinese, setShowChinese] = useState(true);
  
  // Dictionary / Add Word Modal State
  const [dictModal, setDictModal] = useState<{ 
      isOpen: boolean, 
      word: string, 
      loading: boolean, 
      data: any | null, 
      isAdding: boolean,
      generatedImage: string | null,
      showChinese: boolean 
  }>({ 
      isOpen: false, 
      word: '', 
      loading: false, 
      data: null, 
      isAdding: false,
      generatedImage: null,
      showChinese: false
  });

  // Recording State for Dict Modal
  const [isRecording, setIsRecording] = useState(false);
  const [isPlayingUserAudio, setIsPlayingUserAudio] = useState(false);
  const [userAudioUrl, setUserAudioUrl] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const userAudioElementRef = useRef<HTMLAudioElement | null>(null);

  // Text Appearance State (Typewriter effect) - mostly for fallback mode now
  const [visibleWordCount, setVisibleWordCount] = useState(0);

  // Highlighting State
  const [spokenWordIndex, setSpokenWordIndex] = useState<number | null>(null);
  
  // --- SPELLING GAME STATE ---
  const [isSpelling, setIsSpelling] = useState(false);
  const [scrambledLetters, setScrambledLetters] = useState<{id: number, char: string}[]>([]);
  const [userAnswer, setUserAnswer] = useState<(string | null)[]>([]);
  const [spellingStatus, setSpellingStatus] = useState<'idle' | 'correct' | 'wrong' | 'hint'>('idle');
  
  // Game State
  const [foundWordsMap, setFoundWordsMap] = useState<Record<number, string[]>>({});
  
  // Animation State for "Hand Grab"
  const [handAnim, setHandAnim] = useState<{x: number, y: number, show: boolean}>({ x: 0, y: 0, show: false });

  // --- AUDIO REFS ---
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioAnimFrameRef = useRef<number | null>(null); 
  const isMountedRef = useRef(true);
  const currentPageRef = useRef(0); 

  const currentContent = story.pages[currentPage];
  const isLastPage = currentPage === story.pages.length - 1;

  // Adaptive Difficulty Logic
  const isHardSpelling = useMemo(() => {
     return kidProfile.ageGroup === '9-12' || kidProfile.englishLevel === 'Advanced';
  }, [kidProfile]);

  useEffect(() => {
      isMountedRef.current = true;
      return () => {
          isMountedRef.current = false;
          stopAllAudio();
          stopRecordingStreams();
      };
  }, []);

  // Sync ref
  useEffect(() => {
      currentPageRef.current = currentPage;
  }, [currentPage]);

  // Cleanup recording when modal closes
  useEffect(() => {
      if (!dictModal.isOpen && !selectedWordData) {
          stopRecordingStreams();
          setUserAudioUrl(null);
          setIsRecording(false);
      }
  }, [dictModal.isOpen, selectedWordData]);

  const stopRecordingStreams = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
  };

  // --- RECORDING ---
  const startRecording = async () => {
      try {
          audioManager.stopAll();
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
          console.error("Mic error:", err);
          alert("Microphone access needed for recording.");
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && isRecording) {
          playPop();
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
      if (playPromise) {
          playPromise.catch(e => console.error(e));
      }
  };


  // --- AUDIO MANAGEMENT ---
  const stopAllAudio = () => {
      // FORCE STOP MANAGER
      audioManager.stopAll();

      // Stop local references
      if (audioSourceRef.current) {
          try {
              audioSourceRef.current.stop();
              audioSourceRef.current.disconnect();
          } catch (e) { /* ignore */ }
          audioSourceRef.current = null;
      }
      if (audioAnimFrameRef.current) {
          cancelAnimationFrame(audioAnimFrameRef.current);
          audioAnimFrameRef.current = null;
      }
      
      // Reset States
      setIsPlayingStoryteller(false);
      setIsGeneratingAudio(false);
      setSpokenWordIndex(null);
  };

  // 1. Reset Audio/State on Page Change
  useEffect(() => {
    // CRITICAL: Stop audio immediately when page index changes
    stopAllAudio();
    setHandAnim({x:0, y:0, show: false});
    setVisibleWordCount(0);
    // Auto-scroll logic if using text flow can be added here
  }, [currentPage]);

  // --- SPELLING GAME LOGIC ---
  const initSpellingGame = (word: string) => {
      playPop();
      const chars = word.replace(/[^a-zA-Z]/g, '').toUpperCase().split('');
      const shuffled = chars.map((char, idx) => ({ id: idx, char }))
                            .sort(() => Math.random() - 0.5);
      
      setScrambledLetters(shuffled);
      setUserAnswer(new Array(chars.length).fill(null));
      setSpellingStatus('idle');
      setIsSpelling(true);
      if (isHardSpelling) playWordAudio(word);
  };

  const resetSpellingGame = () => {
     playClick();
     if (selectedWordData) {
         setSpellingStatus('idle');
         initSpellingGame(selectedWordData.word);
     }
  };

  const handleLetterTap = (charObj: {id: number, char: string}) => {
      if (spellingStatus === 'correct' || spellingStatus === 'hint') return;
      playClick(); 
      const emptyIndex = userAnswer.findIndex(slot => slot === null);
      if (emptyIndex !== -1) {
          const newAnswer = [...userAnswer];
          newAnswer[emptyIndex] = charObj.char;
          setUserAnswer(newAnswer);
          setScrambledLetters(prev => prev.filter(l => l.id !== charObj.id));
      }
  };

  const handleBackspace = () => {
      if (spellingStatus === 'correct' || spellingStatus === 'hint') return;
      playClick();
      let filledIndex = -1;
      for (let i = userAnswer.length - 1; i >= 0; i--) {
          if (userAnswer[i] !== null) {
              filledIndex = i;
              break;
          }
      }
      if (filledIndex !== -1) {
          const charToRemove = userAnswer[filledIndex];
          if (!charToRemove) return;
          const newAnswer = [...userAnswer];
          newAnswer[filledIndex] = null;
          setUserAnswer(newAnswer);
          setScrambledLetters(prev => [...prev, { id: Date.now(), char: charToRemove }]);
      }
  };

  const checkSpelling = () => {
      if (!selectedWordData) return;
      playClick();
      const target = selectedWordData.word.replace(/[^a-zA-Z]/g, '').toUpperCase();
      const input = userAnswer.join('');

      if (input === target) {
          setSpellingStatus('correct');
          playSuccess(); // SUCCESS SOUND
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, zIndex: 9999 });
          playWordAudio("Correct! " + selectedWordData.word);
          if (!earnedStarWords.has(selectedWordData.id)) {
             setEarnedStarWords(prev => new Set(prev).add(selectedWordData.id));
             setStarCount(prev => prev + 1);
          }
      } else {
          setSpellingStatus('wrong');
          playError(); // ERROR SOUND
          setSpellingStatus('hint');
          setUserAnswer(target.split(''));
          setTimeout(() => resetSpellingGame(), 2000);
      }
  };

  const handleSpellingSuccessDone = () => {
      playPop();
      setSelectedWordData(null);
      setIsSpelling(false);
  };

  const handleNext = () => {
    stopAllAudio(); 
    playPageTurn();
    if (currentPage < story.pages.length - 1) {
      setCurrentPage(prev => prev + 1);
    } else {
      onFinish();
    }
  };

  const handlePrev = () => {
    stopAllAudio();
    playPageTurn();
    if (currentPage > 0) setCurrentPage(prev => prev - 1);
  };

  const playWordAudio = async (text: string) => {
      await audioManager.speak(text);
  };

  const playHumanNarration = async () => {
      playToggle(); 
      if (isPlayingStoryteller || isGeneratingAudio) {
          stopAllAudio();
          return;
      }
      stopAllAudio();
      
      const targetPage = currentPage;
      setIsGeneratingAudio(true);
      
      try {
          const text = currentContent.text.replace(/\*/g, '');
          
          // Use timeout logic manually here for visual sync support
          const timeoutPromise = new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000));
          
          // GENERATE ONLY ENGLISH AUDIO for learning flow
          const audioData = await Promise.race([
              generateSpeech(text),
              timeoutPromise
          ]);
          
          // Check if user turned page during generation
          if (currentPageRef.current !== targetPage) {
              setIsGeneratingAudio(false);
              return;
          }

          setIsGeneratingAudio(false);
          
          if (isMountedRef.current) {
              if (audioData) {
                  // Re-construct clean words from all lines if available, or just use full text fallback
                  const allLines = currentContent.lines || [{ text: currentContent.text, textCN: "" }];
                  const allWordsSequence: {clean: string}[] = [];
                  
                  allLines.forEach(line => {
                      const words = line.text.replace(/\*/g, '').split(/\s+/).map(w => ({ clean: w.replace(/[^a-zA-Z0-9']/g, '') }));
                      allWordsSequence.push(...words);
                  });

                  playGeminiAudioData(audioData as string, allWordsSequence);
              } else {
                  audioManager.playBrowserTTS(text);
              }
          }
      } catch (err) {
          console.error("Narration error", err);
          if (isMountedRef.current && currentPageRef.current === targetPage) {
              setIsGeneratingAudio(false);
              const textToRead = currentContent.text.replace(/\*/g, '');
              audioManager.playBrowserTTS(textToRead);
          }
      }
  };

   // --- AI AUDIO PLAYER (With Character-Weighted Sync) ---
   const playGeminiAudioData = async (base64Audio: string, textSegments: {clean: string}[]) => {
    if (!isMountedRef.current) return;
    
    // Check if page changed while generating
    if (currentPageRef.current !== currentPage) return;

    stopAllAudio(); 

    try {
        const ctx = audioManager.getAudioContext();
        if (ctx.state === 'suspended') await ctx.resume();

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const float32Array = new Float32Array(len / 2);
        const dataView = new DataView(bytes.buffer);
        
        for (let i = 0; i < len / 2; i++) {
             float32Array[i] = dataView.getInt16(i * 2, true) / 32768.0;
        }

        const buffer = ctx.createBuffer(1, float32Array.length, 24000);
        buffer.getChannelData(0).set(float32Array);

        if (currentPageRef.current !== currentPage) return;

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        
        // --- CHARACTER-WEIGHTED SYNC ---
        const totalChars = textSegments.reduce((sum, seg) => sum + seg.clean.length, 0);
        
        const startTime = ctx.currentTime;
        const duration = buffer.duration;
        
        const updateHighlight = () => {
            if (!isMountedRef.current || currentPageRef.current !== currentPage) return;
            
            const elapsed = ctx.currentTime - startTime;
            if (elapsed >= duration) {
                setSpokenWordIndex(null);
                setIsPlayingStoryteller(false);
                return;
            }
            
            const progress = elapsed / duration;
            const targetCharIndex = Math.floor(progress * totalChars);

            let currentCharCount = 0;
            let foundIndex = -1;

            for (let i = 0; i < textSegments.length; i++) {
                const wordLen = textSegments[i].clean.length;
                if (targetCharIndex >= currentCharCount && targetCharIndex < currentCharCount + wordLen) {
                    foundIndex = i;
                    break;
                }
                currentCharCount += wordLen;
            }
            
            if (foundIndex !== -1) {
                setSpokenWordIndex(foundIndex);
            }
            
            audioAnimFrameRef.current = requestAnimationFrame(updateHighlight);
        };

        audioAnimFrameRef.current = requestAnimationFrame(updateHighlight);

        source.onended = () => {
            if (isMountedRef.current) {
                setIsPlayingStoryteller(false);
                if (audioAnimFrameRef.current) cancelAnimationFrame(audioAnimFrameRef.current);
                setSpokenWordIndex(null);
            }
        };

        audioSourceRef.current = source;
        source.start();
        setIsPlayingStoryteller(true);
    } catch (e) {
        console.error("Audio Playback Error", e);
        setIsPlayingStoryteller(false);
        const text = textSegments.map(t => t.clean).join(" ");
        audioManager.playBrowserTTS(text);
    }
};

  const handleWordClick = async (e: React.MouseEvent, wordText: string, isValidInteractive: boolean) => {
    e.stopPropagation();
    
    // Improved cleaning: Remove leading/trailing non-alphanumeric chars only
    const cleanWord = wordText.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
    
    if (cleanWord.length < 2 && cleanWord.toLowerCase() !== 'i') return;

    // Strict matching logic
    const matchingQuestItem = localLearnedWords.find(w => {
        const tClean = cleanWord.toLowerCase();
        const wClean = w.word.toLowerCase();
        
        if (tClean === wClean || tClean === wClean + 's' || tClean === wClean + 'es' || wClean === tClean + 's') return true;

        const parts = wClean.split(/[\s-]+/);
        if (parts.length > 1) {
             return parts.some(part => {
                 if (part.length < 2) return false;
                 return tClean === part || tClean === part + 's' || tClean === part + 'es';
             });
        }
        return false;
    });
    
    if (matchingQuestItem) {
        if (!foundWordsMap[currentPage]?.includes(matchingQuestItem.id)) {
            setFoundWordsMap(prev => ({
                ...prev,
                [currentPage]: [...(prev[currentPage] || []), matchingQuestItem.id]
            }));
            playPing();
            confetti({ particleCount: 30, spread: 40, origin: { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight } });
        }
    }

    if (isValidInteractive) {
        // Handle QUEST Item Click (Spelling Game)
        if (matchingQuestItem) {
            playPop();
            playWordAudio(matchingQuestItem.word); 
            
            setUserAudioUrl(null);
            setIsRecording(false);
            
            setHandAnim({ x: e.clientX, y: e.clientY, show: true });
            
            setTimeout(() => {
                if (isMountedRef.current) {
                    setHandAnim(prev => ({ ...prev, show: false }));
                    setSelectedWordData(matchingQuestItem);
                    setIsSpelling(false);
                }
            }, 1000);
        }
    } else {
        // Handle DICTIONARY Click
        playPop();
        stopAllAudio();
        setUserAudioUrl(null);
        setIsRecording(false);
        setIsPlayingUserAudio(false);
        setDictModal({ isOpen: true, word: cleanWord, loading: true, data: null, isAdding: false, generatedImage: null, showChinese: false });
        playWordAudio(cleanWord);
        
        const data = await lookupWordDefinition(cleanWord, currentContent.text, kidProfile.ageGroup);
        if (!isMountedRef.current) return;

        let generatedImg = null;
        if (data.visualDetail) {
             generatedImg = await generateIllustration(
                data.visualDetail, 
                "icon sticker style, simple, white background, cute vector art", 
                "cartoon"
            );
        }

        if (isMountedRef.current) {
            setDictModal(prev => ({ 
                ...prev, 
                loading: false, 
                data,
                generatedImage: generatedImg 
            }));
        }
    }
  };
  
  const handleAddToLibrary = async () => {
      if (!dictModal.word || !dictModal.data) return;
      
      playMagic(); 
      setDictModal(prev => ({ ...prev, isAdding: true }));
      
      try {
          const finalImage = dictModal.generatedImage || 'https://cdn-icons-png.flaticon.com/512/3574/3574069.png';

          const newWord: LearnedWord = {
              id: Date.now().toString(),
              word: dictModal.word,
              definition: dictModal.data.definition,
              definitionCN: dictModal.data.definitionCN, 
              imageUrl: finalImage,
              originalImage: finalImage,
              timestamp: Date.now(),
              visualDetail: dictModal.data.visualDetail
          };
          
          onWordAdded(newWord);
          setLocalLearnedWords(prev => [...prev, newWord]);
          
          setFoundWordsMap(prev => ({
              ...prev,
              [currentPage]: [...(prev[currentPage] || []), newWord.id]
          }));

          playSuccess();
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
          
          setDictModal(prev => ({ 
              ...prev, 
              isAdding: false,
          }));
          
      } catch (e) {
          console.error(e);
          playError();
          setDictModal(prev => ({ ...prev, isAdding: false }));
      }
  };

  const closeDictModal = () => {
      playClick();
      setDictModal(prev => ({ ...prev, isOpen: false }));
      setUserAudioUrl(null);
      setIsRecording(false);
  }

  // --- HELPER: RENDER CHINESE TEXT WITH BOLDING ---
  const renderChineseLine = (textCN: string) => {
      // Split by asterisk to find highlighted words
      // e.g., "我看见了一个*苹果*。" -> ["我看见了一个", "苹果", "。"]
      const parts = textCN.split('*');
      return parts.map((part, i) => {
          // If odd index, it was inside asterisks -> Bold it
          if (i % 2 === 1) {
              return <span key={i} className="font-bold text-brand-blue mx-0.5">{part}</span>;
          }
          return <span key={i}>{part}</span>;
      });
  };

  // --- NEW: RENDER SEGMENTED TEXT FOR BILINGUAL VIEW ---
  const renderInterleavedContent = () => {
    // If we have strict line data (New format)
    const lines = currentContent.lines || [{ text: currentContent.text, textCN: currentContent.textCN }];
    
    // Global word index counter for highlighting
    let globalWordIndex = 0;

    return (
        <div className="flex flex-col gap-6 md:gap-8 px-2 py-4">
            {lines.map((line, lineIdx) => {
                const lineChunks = line.text.split(/\s+/).map(chunk => {
                    const isSpecial = chunk.includes('*');
                    const visualText = chunk.replace(/\*/g, '');
                    const clean = visualText.replace(/[^a-zA-Z0-9']/g, ''); 
                    return { text: visualText, clean: clean, raw: chunk, isSpecial };
                });

                return (
                    <div key={lineIdx} className="flex flex-col gap-2">
                        {/* English Line */}
                        <div className="flex flex-wrap gap-x-2 md:gap-x-3 gap-y-1 md:gap-y-2 leading-relaxed md:leading-[2.0] justify-center md:justify-start">
                            {lineChunks.map((item, wordIdx) => {
                                const currentIndex = globalWordIndex++; // Increment global index
                                
                                // Interactive Word Logic
                                const cleanText = item.clean;
                                const matchingLearnedWord = localLearnedWords.find(w => {
                                    const tClean = cleanText.toLowerCase();
                                    if (tClean.length < 2 && tClean !== 'i') return false; 
                                    const wClean = w.word.toLowerCase();
                                    if (wClean === tClean || tClean === wClean + 's' || tClean === wClean + 'es' || wClean === tClean + 's') return true;
                                    const parts = wClean.split(/[\s-]+/);
                                    if (parts.length > 1) {
                                         return parts.some(part => {
                                             if (part.length < 2) return false; 
                                             return tClean === part || tClean === part + 's' || tClean === part + 'es';
                                         });
                                    }
                                    return false;
                                });
                                
                                const isFound = matchingLearnedWord && foundWordsMap[currentPage]?.includes(matchingLearnedWord.id);
                                const isValidInteractive = (item.isSpecial && !!matchingLearnedWord) || (!!matchingLearnedWord);
                                const isHighlighted = spokenWordIndex === currentIndex;

                                return (
                                    <span
                                        key={wordIdx}
                                        onClick={(e) => handleWordClick(e, item.text, !!isValidInteractive)}
                                        className={`
                                            relative px-1 rounded-lg transition-all duration-200
                                            text-xl md:text-3xl font-medium select-none cursor-pointer
                                            ${isHighlighted 
                                                ? 'bg-yellow-300 text-black scale-110 shadow-sm z-10 font-black -rotate-1' 
                                                : 'text-slate-800 hover:text-brand-blue hover:bg-slate-50'
                                            }
                                            ${!isHighlighted && isPlayingStoryteller ? 'opacity-40 blur-[0.3px]' : ''}
                                            ${isValidInteractive && !isHighlighted && !isFound ? 'text-brand-blue border-b-2 border-dashed border-brand-blue/30' : ''}
                                            ${isValidInteractive && isFound && !isHighlighted ? 'text-brand-green bg-green-50 border-b-2 border-brand-green' : ''}
                                        `}
                                    >
                                        {item.text}
                                    </span>
                                );
                            })}
                        </div>
                        
                        {/* Chinese Line (Visibility Toggled) with Bold Parsing */}
                        {showChinese && line.textCN && (
                            <div className="text-base md:text-xl text-slate-500 font-medium leading-relaxed md:leading-relaxed text-center md:text-left px-1 animate-pop-in">
                                {renderChineseLine(line.textCN)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
  };

  const pageTargets = useMemo(() => {
      if (!localLearnedWords) return [];
      
      return localLearnedWords.filter(lw => {
          const lwParts = lw.word.toLowerCase().split(/[\s-]+/);
          const textLower = currentContent.text.toLowerCase();
          
          return lwParts.some(part => {
              if (part.length < 2 && lwParts.length > 1) return false;
              try {
                  const regex = new RegExp(`\\b${part}(s|es)?\\b`, 'i');
                  return regex.test(textLower);
              } catch (e) {
                  return false;
              }
          });
      });
  }, [currentContent, localLearnedWords]);

  return (
    <div className="h-full w-full flex flex-col bg-white md:bg-transparent relative">
      {/* HAND GRAB ANIMATION OVERLAY */}
      {handAnim.show && (
          <div className="fixed z-[100] pointer-events-none" style={{ left: handAnim.x, top: handAnim.y, transform: 'translate(-50%, -50%)' }}>
              <div className="text-6xl md:text-8xl drop-shadow-2xl animate-grab-pop">✋</div>
          </div>
      )}

      {/* DICTIONARY MODAL - HIGH Z-INDEX */}
      {dictModal.isOpen && (
         <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-pop-in">
             <div className="bg-white rounded-[2.5rem] w-full max-w-sm shadow-2xl relative border-8 border-white ring-4 ring-brand-purple flex flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
                 
                 <button onClick={closeDictModal} className="absolute top-4 right-4 bg-slate-100 p-2 rounded-full hover:bg-slate-200 z-10">
                     <X size={20} className="text-slate-500" />
                 </button>

                 <div className="bg-purple-50 p-6 text-center border-b border-purple-100 flex flex-col items-center">
                     {dictModal.loading ? (
                         <div className="h-20 flex items-center justify-center"><Loader2 className="animate-spin text-brand-purple" size={40} /></div>
                     ) : (
                         <>
                            <div className="w-32 h-32 rounded-2xl overflow-hidden border-4 border-white shadow-lg rotate-3 mb-4 animate-pop-in bg-white">
                                {dictModal.generatedImage ? (
                                    <img src={dictModal.generatedImage} className="w-full h-full object-cover" alt="New Sticker" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-purple-200"><ImageIcon size={40} /></div>
                                )}
                            </div>
                            <h2 className="text-2xl font-black text-brand-purple capitalize tracking-tight mb-2">{dictModal.word}</h2>
                            <button onClick={() => playWordAudio(dictModal.word)} className="bg-white px-4 py-2 rounded-full shadow-sm flex items-center gap-2 text-brand-purple font-bold hover:scale-105 transition-transform mb-2">
                                <Volume2 size={20} /> Listen
                            </button>
                            
                            {/* VOICE STUDIO in Dict Modal */}
                            <div className="flex items-center gap-2 bg-white/50 p-1.5 rounded-full border border-purple-100">
                                {isRecording ? (
                                    <button onClick={stopRecording} className="w-10 h-10 bg-red-500 rounded-full text-white animate-pulse flex items-center justify-center"><Square size={16} fill="currentColor" /></button>
                                ) : (
                                    <button onClick={startRecording} className="w-10 h-10 bg-white rounded-full text-red-500 border border-red-100 flex items-center justify-center hover:bg-red-50"><Mic size={20} /></button>
                                )}
                                {userAudioUrl && !isRecording && (
                                    <button onClick={() => playUserAudio()} className={`w-10 h-10 rounded-full text-white flex items-center justify-center ${isPlayingUserAudio ? 'bg-brand-blue' : 'bg-blue-300'}`}>
                                        {isPlayingUserAudio ? <Volume2 size={16} /> : <Play size={16} fill="currentColor" />}
                                    </button>
                                )}
                                <span className="text-xs font-bold text-slate-400 px-2">
                                    {isRecording ? "Recording..." : userAudioUrl ? "Replay" : "Try saying it!"}
                                </span>
                            </div>
                         </>
                     )}
                 </div>

                 <div className="p-6 flex-1 bg-white">
                     {dictModal.loading ? (
                         <div className="space-y-3 animate-pulse">
                             <div className="h-4 bg-slate-100 rounded w-3/4 mx-auto"></div>
                             <div className="h-4 bg-slate-100 rounded w-1/2 mx-auto"></div>
                         </div>
                     ) : (
                         localLearnedWords.some(w => w.word.toLowerCase() === dictModal.word.toLowerCase()) || dictModal.isAdding === false && dictModal.generatedImage && dictModal.data === null ? (
                             <div className="text-center animate-pop-in">
                                 <p className="text-lg text-slate-500 font-medium mb-6">It has been saved to your sticker cabinet.</p>
                                 <button 
                                    onClick={closeDictModal}
                                    className="w-full py-4 bg-brand-blue text-white rounded-2xl font-bold text-lg shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2"
                                 >
                                    Awesome! <CheckCircle />
                                 </button>
                             </div>
                         ) : (
                             <div className="text-center">
                                 {/* Translate Toggle in Modal */}
                                 {dictModal.data?.definitionCN && (
                                     <div className="flex justify-end mb-2">
                                         <button 
                                             onClick={() => setDictModal(prev => ({...prev, showChinese: !prev.showChinese}))}
                                             className="flex items-center gap-1 text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-full hover:bg-slate-200 transition-colors"
                                         >
                                             <Languages size={14} /> {dictModal.showChinese ? "Show English" : "Show Translation"}
                                         </button>
                                     </div>
                                 )}

                                 <p className="text-xl font-medium text-slate-700 leading-relaxed mb-6">
                                     "{dictModal.showChinese ? dictModal.data?.definitionCN : dictModal.data?.definition}"
                                 </p>
                                 
                                 <div className="bg-yellow-50 p-4 rounded-xl border border-yellow-200 text-sm font-bold text-slate-600 mb-6 flex gap-2 items-start text-left">
                                     <span className="text-xl">💡</span>
                                     <span>{dictModal.data?.funFact}</span>
                                 </div>

                                 <button 
                                    onClick={handleAddToLibrary}
                                    disabled={dictModal.isAdding}
                                    className="w-full py-4 bg-brand-green text-white rounded-2xl font-bold text-lg shadow-[0_4px_0_0_#15803d] active:shadow-none active:translate-y-1 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:translate-y-0"
                                 >
                                     {dictModal.isAdding ? (
                                         <>
                                            <Loader2 className="animate-spin" /> Painting Sticker...
                                         </>
                                     ) : (
                                         <>
                                            <ImageIcon size={24} strokeWidth={3} /> Add to Library
                                         </>
                                     )}
                                 </button>
                             </div>
                         )
                     )}
                 </div>
             </div>
         </div>
      )}

      {/* SPELLING MODAL (FOUND WORD MODAL) */}
      {selectedWordData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-pop-in">
             <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl relative border-4 border-white ring-4 ring-brand-blue flex flex-col max-h-[90dvh] overflow-hidden pt-[env(safe-area-inset-top)]">
                <div className="bg-blue-50 p-3 flex justify-between items-center border-b border-blue-100 shrink-0">
                    <h2 className="text-lg font-black text-brand-blue uppercase tracking-wider flex items-center gap-2">
                        <Sparkles size={20} /> Spell It
                    </h2>
                    <button onClick={() => setSelectedWordData(null)} className="p-2 bg-white rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-4 md:p-8 overflow-y-auto flex-1 flex flex-col items-center">
                    <div className="w-32 h-32 md:w-56 md:h-56 bg-slate-100 rounded-2xl mb-4 md:mb-6 shadow-inner relative overflow-hidden shrink-0 border-4 border-slate-50">
                         <img src={selectedWordData.imageUrl} className="w-full h-full object-cover" alt="Spell this" />
                         <button onClick={() => playWordAudio(selectedWordData.word)} className="absolute bottom-2 right-2 p-2 bg-white rounded-full text-brand-orange shadow-md hover:scale-110 active:scale-95 transition-all">
                             <Volume2 size={20} />
                         </button>
                    </div>
                    {!isSpelling ? (
                         <div className="text-center w-full flex flex-col items-center">
                             <div className="mb-2">
                                <h3 className="text-3xl md:text-5xl font-black text-slate-800 capitalize mb-0">{selectedWordData.word}</h3>
                                {selectedWordData.wordCN && <p className="text-xl font-bold text-slate-400 mt-1">{selectedWordData.wordCN}</p>}
                             </div>

                             <p className="text-slate-500 font-medium text-base md:text-lg mb-4">"{selectedWordData.definition}"</p>
                             
                             {/* ADD RECORDING TO FOUND ITEM MODAL */}
                             <div className="flex items-center gap-3 bg-blue-50 p-2 rounded-full border border-blue-100 mb-6">
                                {isRecording ? (
                                    <button onClick={stopRecording} className="w-12 h-12 bg-red-500 rounded-full text-white animate-pulse flex items-center justify-center shadow-sm"><Square size={16} fill="currentColor" /></button>
                                ) : (
                                    <button onClick={startRecording} className="w-12 h-12 bg-white rounded-full text-red-500 border border-red-100 flex items-center justify-center hover:bg-red-50 shadow-sm"><Mic size={24} /></button>
                                )}
                                <div className="flex flex-col items-start px-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Voice Studio</span>
                                    <span className="text-sm font-bold text-brand-blue">
                                        {isRecording ? "Recording..." : userAudioUrl ? "Great job!" : "Practice Saying It"}
                                    </span>
                                </div>
                                {userAudioUrl && !isRecording && (
                                    <button onClick={() => playUserAudio()} className={`w-12 h-12 rounded-full text-white flex items-center justify-center shadow-sm ${isPlayingUserAudio ? 'bg-brand-blue' : 'bg-blue-300'}`}>
                                        {isPlayingUserAudio ? <Volume2 size={20} /> : <Play size={20} fill="currentColor" />}
                                    </button>
                                )}
                             </div>

                             <button onClick={() => initSpellingGame(selectedWordData.word)} className="w-full py-3 md:py-4 bg-brand-blue text-white rounded-xl md:rounded-2xl font-bold text-xl md:text-2xl shadow-[0_4px_0_0_#2563eb] active:translate-y-1 active:shadow-none transition-all flex items-center justify-center gap-3">
                                 <Sparkles /> Start Spelling
                             </button>
                         </div>
                    ) : (
                         <div className="w-full flex flex-col items-center">
                             <div className="mb-4 md:mb-6 flex gap-1">
                                 {!isHardSpelling ? (
                                    <span className="font-black text-2xl md:text-3xl text-slate-200 tracking-[0.2em] uppercase">{selectedWordData.word}</span>
                                 ) : (
                                    selectedWordData.word.split('').map((_, i) => <div key={i} className="w-3 h-1 bg-slate-200 rounded-full mx-0.5"></div>)
                                 )}
                             </div>
                             <div className="flex flex-nowrap justify-center gap-1 md:gap-2 mb-6 w-full px-1">
                                {userAnswer.map((char, index) => (
                                    <div key={index} onClick={handleBackspace} className={`flex-1 max-w-[3rem] md:max-w-[4rem] aspect-[3/4] rounded-lg md:rounded-xl border-b-4 flex items-center justify-center font-black cursor-pointer transition-all ${selectedWordData.word.length > 6 ? 'text-xl md:text-3xl' : 'text-3xl md:text-5xl'} ${spellingStatus === 'wrong' ? 'animate-shake border-red-200 bg-red-50 text-red-500' : ''} ${spellingStatus === 'correct' ? 'border-brand-green bg-green-100 text-brand-green scale-110' : ''} ${spellingStatus === 'hint' ? 'border-orange-200 bg-orange-50 text-brand-orange opacity-80' : ''} ${!char && spellingStatus === 'idle' ? 'bg-slate-50 border-slate-200' : ''} ${char && spellingStatus === 'idle' ? 'bg-white border-brand-blue text-brand-blue shadow-sm' : ''}`}>
                                        {char}
                                    </div>
                                ))}
                             </div>
                             {spellingStatus === 'correct' ? (
                                 <div className="animate-pop-in text-center w-full">
                                     <h3 className="text-2xl md:text-3xl font-black text-brand-green mb-4">Awesome!</h3>
                                     <button onClick={handleSpellingSuccessDone} className="w-full py-3 bg-brand-green text-white rounded-full font-bold text-lg md:text-xl shadow-lg hover:scale-105 transition-transform flex items-center justify-center gap-2">
                                         <Star className="fill-yellow-300 text-yellow-300" /> Done
                                     </button>
                                 </div>
                             ) : spellingStatus === 'hint' ? (
                                <div className="animate-pop-in text-center text-brand-orange font-bold text-lg mb-4">Watch closely...</div>
                             ) : (
                                 <>
                                     <div className="flex flex-wrap justify-center gap-2 mb-6">
                                         {scrambledLetters.map((item) => (
                                             <button key={item.id} onClick={() => handleLetterTap(item)} className="w-10 h-10 md:w-14 md:h-14 bg-white rounded-lg md:rounded-xl shadow-sm border border-slate-200 text-xl md:text-2xl font-black text-slate-700 active:scale-95 active:bg-slate-100 transition-all flex items-center justify-center">
                                                 {item.char}
                                             </button>
                                         ))}
                                     </div>
                                     <div className="flex gap-3 w-full mt-auto">
                                         <button onClick={resetSpellingGame} className="p-3 md:p-4 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200"><Sparkles size={20} /></button>
                                         <button onClick={checkSpelling} disabled={userAnswer.includes(null)} className="flex-1 py-3 md:py-4 bg-brand-blue text-white rounded-xl font-bold text-lg md:text-xl shadow-[0_4px_0_0_#2563eb] active:translate-y-1 active:shadow-none transition-all disabled:opacity-50 disabled:shadow-none disabled:translate-y-1">Check</button>
                                     </div>
                                 </>
                             )}
                         </div>
                    )}
                </div>
             </div>
          </div>
      )}

      {/* STORY HEADER (Immersive) */}
      <div className="h-14 md:h-16 flex items-center justify-between px-3 md:px-6 shrink-0 bg-white border-b border-slate-100 z-30 shadow-sm pt-[env(safe-area-inset-top)] md:pt-0 box-content">
          <button onClick={onFinish} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors">
             <X size={20} />
          </button>
          
          <div className="flex items-center gap-3">
              <div className="bg-yellow-50 px-3 py-1 rounded-full border border-yellow-200 flex items-center gap-1">
                 <Star className="fill-brand-yellow text-brand-yellow" size={16} />
                 <span className="font-black text-brand-yellow text-base">{starCount}</span>
              </div>
          </div>
          
          <div className="flex items-center gap-2">
              {/* Toggle Translation Visibility */}
              <button 
                onClick={() => { playClick(); setShowChinese(prev => !prev); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all border-2 ${showChinese ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-white text-slate-400 border-slate-200'}`}
                title="Show/Hide Translation"
              >
                  {showChinese ? <Eye size={18} /> : <EyeOff size={18} />}
                  <span className="text-xs font-bold uppercase hidden sm:inline">Show Translation</span>
              </button>

              <button 
                onClick={playHumanNarration}
                disabled={isGeneratingAudio}
                className={`flex items-center gap-2 px-3 py-2 rounded-full transition-all border-2 ${isPlayingStoryteller ? 'bg-brand-orange text-white border-brand-orange' : isGeneratingAudio ? 'bg-orange-50 text-brand-orange border-orange-200' : 'bg-white text-slate-500 border-slate-200 hover:border-brand-orange'}`}
                title="Storyteller Mode"
              >
                  {isGeneratingAudio ? <Loader2 size={18} className="animate-spin" /> : isPlayingStoryteller ? <Pause size={18} /> : <Sparkles size={18} />}
                  <span className="text-xs font-bold uppercase hidden sm:inline">{isGeneratingAudio ? 'Loading...' : 'Storyteller'}</span>
              </button>
          </div>
      </div>

      {/* MAIN LAYOUT SPLIT */}
      <div className="flex-1 flex flex-col md:flex-row h-full min-h-0 relative overflow-hidden pb-[env(safe-area-inset-bottom)]">
         {/* Updated Container for Adaptive Sizing: Removed aspect-square, added flexible height */}
         <div className="w-full shrink-0 h-[40dvh] md:aspect-auto md:h-full md:w-1/2 bg-slate-100 relative flex items-center justify-center p-0 md:p-6 overflow-hidden">
             <div className="hidden md:block absolute inset-4 bg-white rounded-[2rem] shadow-xl rotate-1"></div>
             <div className="relative w-full h-full md:aspect-square md:h-auto max-h-full md:rounded-xl md:overflow-hidden md:shadow-sm md:border md:border-slate-200 bg-white">
                 {currentContent.imageUrl ? (
                     <>
                        <img src={currentContent.imageUrl} alt={`Page ${currentPage + 1}`} className="w-full h-full object-cover relative z-10" />
                     </>
                 ) : (
                     <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50 font-bold animate-pulse">Painting Scene...</div>
                 )}
                 <button className="absolute bottom-4 right-4 p-2 bg-black/20 text-white rounded-full hover:bg-black/40 backdrop-blur-sm z-20" onClick={() => { playPop(); currentContent.imageUrl && setZoomImage(currentContent.imageUrl) }}>
                     <Maximize2 size={16} />
                 </button>
             </div>
         </div>
         <div className="flex-1 w-full md:w-1/2 flex flex-col bg-white relative h-full min-h-0">
             <div className="flex-1 overflow-y-auto p-4 md:p-8 pb-32 md:pb-8 flex flex-col items-center md:items-start text-center md:text-left scrollbar-hide">
                 <div className="mb-4 inline-block px-3 py-1 bg-slate-50 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-wider">Page {currentPage + 1} / {story.pages.length}</div>
                 
                 <div className="w-full mb-6">
                    {/* NEW RENDERING: Line-by-line bilingual */}
                    {renderInterleavedContent()}
                 </div>

                 {/* FIND BAR */}
                 {pageTargets.length > 0 && (
                     <div className="w-full mb-6 bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col items-center md:items-start gap-2 animate-pop-in">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1">
                           <Search size={14} /> Find on this page:
                        </span>
                        <div className="flex gap-3 flex-wrap justify-center md:justify-start">
                           {pageTargets.map(item => {
                                const isFound = foundWordsMap[currentPage]?.includes(item.id);
                                return (
                                    <div key={item.id} className={`flex items-center gap-2 bg-white px-2 py-1 rounded-xl border ${isFound ? 'border-brand-green/30 bg-green-50/50' : 'border-slate-200'}`}>
                                        <div className={`w-8 h-8 rounded-lg overflow-hidden border ${isFound ? 'border-brand-green' : 'border-slate-200'} shrink-0`}>
                                            <img src={item.imageUrl} className={`w-full h-full object-cover ${isFound ? '' : 'grayscale opacity-70'}`} alt={item.word} />
                                        </div>
                                        <span className={`text-xs font-bold uppercase ${isFound ? 'text-brand-green' : 'text-slate-400'}`}>{item.word}</span>
                                        {isFound && <CheckCircle size={14} className="text-brand-green ml-1" />}
                                    </div>
                                );
                           })}
                        </div>
                     </div>
                 )}
             </div>
             
             {/* Bottom Navigation */}
             <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-slate-100 p-2 md:p-4 z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] flex flex-col gap-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
                  <div className="flex items-center gap-3 w-full max-w-lg mx-auto">
                     <button onClick={handlePrev} disabled={currentPage === 0} className="p-3 md:p-4 rounded-full bg-slate-50 text-slate-400 disabled:opacity-20 hover:bg-slate-100 transition-all shrink-0"><ChevronLeft size={24} /></button>
                     <button onClick={handleNext} className={`flex-1 py-3 md:py-4 rounded-full font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all ${isLastPage ? 'bg-brand-green text-white hover:bg-green-600' : 'bg-brand-blue text-white hover:bg-blue-600'}`}>
                         {isLastPage ? 'Finish' : 'Next'} {isLastPage ? <CheckCircle size={20} /> : <ChevronRight size={20} />}
                     </button>
                  </div>
             </div>
         </div>
      </div>
      {zoomImage && (
          <div className="fixed inset-0 z-[110] bg-black flex items-center justify-center p-0" onClick={() => setZoomImage(null)}>
              <img src={zoomImage} className="w-full h-full object-contain" alt="Zoomed" />
              <button className="absolute top-4 right-4 text-white p-2 bg-white/20 rounded-full"><X size={24} /></button>
          </div>
      )}
    </div>
  );
};
