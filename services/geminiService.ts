
import { GoogleGenAI, Type } from "@google/genai";
import { StoryPage, Theme, LearnedWord, KidProfile } from "../types";

const API_KEY = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey: API_KEY });

const cleanBase64 = (base64: string) => {
  return base64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
};

const cleanJsonString = (text: string) => {
  let clean = text.trim();
  if (clean.startsWith('```json')) {
    clean = clean.replace(/^```json/, '').replace(/```$/, '');
  } else if (clean.startsWith('```')) {
    clean = clean.replace(/^```/, '').replace(/```$/, '');
  }
  return clean.trim();
};

// --- IMAGE OPTIMIZATION ---
// Resizes image on client-side to reduce API payload size and latency
const resizeImage = (base64Str: string, maxWidth: number = 800): Promise<string> => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
        resolve(base64Str);
        return;
    }
    const img = new Image();
    img.src = base64Str;
    img.crossOrigin = "anonymous"; 
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // Calculate new dimensions while maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round(height * (maxWidth / width));
          width = maxWidth;
        }
      } else {
        if (height > maxWidth) {
          width = Math.round(width * (maxWidth / height));
          height = maxWidth;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
          // Fill white background to handle transparency if any
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          // Export as JPEG with 0.7 quality for balance of speed/detail
          resolve(canvas.toDataURL('image/jpeg', 0.7)); 
      } else {
          resolve(base64Str);
      }
    };
    img.onerror = () => {
        console.warn("Image resize failed, using original");
        resolve(base64Str);
    };
  });
};

// --- AUDIO GENERATION (TTS) ---
export const generateSpeech = async (text: string): Promise<string | null> => {
  if (!text || !text.trim()) return null;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text.trim() }] }],
      config: {
        responseModalities: ['AUDIO'], // Changed to string literal for safety
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, 
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (base64Audio) {
      return base64Audio; 
    }
    return null;
  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};

export const identifyObject = async (imageBase64: string, theme?: Theme): Promise<{ word: string, wordCN?: string, definition: string, definitionCN?: string, visualDetail: string, matchesTheme: boolean, feedback?: string }> => {
  try {
    // Optimize: Resize image to 800px max for faster recognition
    const resizedImage = await resizeImage(imageBase64, 800);
    const cleanData = cleanBase64(resizedImage);
    
    // Construct prompt to strictly guide the AI on SINGLE ITEM validation
    let validationLogic = "";
    
    if (theme) {
      // Reconstruct valid sentence from the theme phrase (e.g. "red things" -> "Find red things")
      const ruleDescription = theme.description.startsWith('Find') ? theme.description : `Find ${theme.description}`;

      validationLogic = `
      GAME MODE: "${theme.label}"
      GAME RULE DESCRIPTION: "${ruleDescription}"

      YOUR ROLE: You are a strict but friendly referee for a children's scavenger hunt.
      
      VALIDATION RULES (CRITICAL):
      1. **IGNORE QUANTITIES**: The user is submitting just **ONE** item in this photo. If the rule implies finding multiple (e.g., "Find 3 red things"), IGNORE the number. Do NOT count items. Just check if the SINGLE main object matches the theme.
      2. **STRICT ATTRIBUTE MATCH**: 
         - If theme is RED: The object must be **mostly** RED. A white bottle with a red cap is NOT red. It is white. Reject it.
         - If theme is ROUND: The object must be round. A square box is NOT round.
      3. **SINGLE FOCUS**: Identify the main, dominant object in the center of the frame.
      
      OUTPUT SCENARIOS:
      - Scenario A: Theme is "Red World". Image is a Red Apple. -> matchesTheme: true, feedback: "Awesome! That is a very red apple!"
      - Scenario B: Theme is "Red World". Image is a Blue Car. -> matchesTheme: false, feedback: "That car is Blue! We need something Red."
      - Scenario C: Theme is "Red World". Image is a White Bottle with red text. -> matchesTheme: false, feedback: "That is mostly white. Find something that is ALL red!"
      `;
    }

    const prompt = `
      Analyze this image for an educational app for kids aged 6-12 (Native Chinese speaker learning English).
      
      ${validationLogic}

      Return a JSON object with:
      1. "word": The name of the main object in English (e.g., 'Apple').
      2. "wordCN": The name of the main object in Simplified Chinese (e.g., '苹果').
      3. "definition": A clear, informative definition in English suitable for a primary school student (e.g. "A red fruit that is crunchy and sweet.").
      4. "definitionCN": A clear definition in Simplified Chinese suitable for a primary school student.
      5. "visualDetail": A short description of what it looks like (English).
      6. "matchesTheme": boolean (Did it pass the validation rules?).
      7. "feedback": string (A short, spoken-style message for the child in English. Max 15 words. If rejected, explain why simply).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    if (!response.text) throw new Error("No response text");

    const json = JSON.parse(cleanJsonString(response.text));
    
    return {
        word: json.word?.replace(/[^a-zA-Z ]/g, "") || "Object",
        wordCN: json.wordCN || "",
        definition: json.definition || "Something interesting you found!",
        definitionCN: json.definitionCN || "你发现的一个有趣的物品！",
        visualDetail: json.visualDetail || "A mysterious object.",
        matchesTheme: json.matchesTheme !== false, // Default to true if undefined
        feedback: json.feedback
    };

  } catch (error) {
    console.error("Vision API Error:", error);
    return { 
      word: "Mystery", 
      definition: "A magical item.", 
      visualDetail: "A magical item.",
      matchesTheme: true 
    };
  }
};

export const lookupWordDefinition = async (word: string, context: string, ageGroup: string): Promise<{ definition: string; definitionCN: string; funFact: string; emoji: string; visualDetail: string }> => {
  try {
    const prompt = `
      Explain the word "${word}" to a ${ageGroup} year old child (Native Chinese speaker learning English).
      The explanation should be educational and clear, suitable for school-age children, not toddlers.
      Context sentence from story: "${context}"
      
      Return JSON with:
      1. "definition": Clear explanation in English (1-2 sentences).
      2. "definitionCN": Clear explanation in Simplified Chinese (1-2 sentences).
      3. "funFact": A short, educational fun fact about it in English.
      4. "emoji": A single relevant emoji.
      5. "visualDetail": A clear visual description of what this looks like (for generating a picture).
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const cleanText = cleanJsonString(response.text || "{}");
    const json = JSON.parse(cleanText);
    return {
        definition: json.definition || `It means ${word}.`,
        definitionCN: json.definitionCN || `意思是 ${word}。`,
        funFact: json.funFact || "Words are interesting!",
        emoji: json.emoji || "✨",
        visualDetail: json.visualDetail || `A colorful ${word}`
    };
  } catch (error) {
    console.error("Lookup Error:", error);
    return { definition: "A special word in our story.", definitionCN: "故事里的一个特别的词。", funFact: "Keep reading to find out more!", emoji: "✨", visualDetail: word };
  }
};

// Updated return type to include character visual
export const generateStoryContent = async (
  items: LearnedWord[],
  theme: Theme,
  kidProfile: KidProfile,
  userPrompt?: string
): Promise<{ title: string; pages: StoryPage[]; mainCharacterVisual: string }> => {
  try {
    const itemContext = items.map(i => `Item: ${i.word} (Looks like: ${i.visualDetail})`).join('\n');
    
    console.log("Generating story with items:", itemContext);

    const prompt = `
      You are writing a bilingual short story for a child aged ${kidProfile.ageGroup} who is learning English (Native Chinese).
      English Level: ${kidProfile.englishLevel}.
      
      THEME: ${theme.label} - ${theme.promptContext}
      
      REQUIRED ITEMS (You MUST include these):
      ${items.map(i => `- ${i.word}`).join('\n')}
      
      USER'S IDEA: "${userPrompt || 'No specific idea, just make it fun!'}"
      
      RULES:
      1. **Target Audience**: This is for school-age children (6-12). Avoid baby talk. Use complete, grammatically correct sentences. The plot can be slightly more adventurous or logical.
      2. **Protagonist**: Define a consistent main character.
      3. **Mandatory**: You MUST use all the REQUIRED ITEMS in the story.
      4. **Highlighting**: When you use a REQUIRED ITEM, you MUST wrap it in asterisks like *this*. 
         CRITICAL: You MUST do this for BOTH the English sentence AND the Chinese translation (e.g., "I saw an *apple*." / "我看到了一个*苹果*。").
      5. **Structure**: 5 Pages.
      6. **Structure (CRITICAL)**: Each page MUST be broken down into 'lines'. Each 'line' object must contain:
         - 'text': The English sentence.
         - 'textCN': The direct Chinese translation of that sentence.
      
      OUTPUT: JSON ONLY.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            mainCharacterVisual: { type: Type.STRING, description: "A short physical description of the main character." },
            pages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pageNumber: { type: Type.INTEGER },
                  lines: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING, description: "One English sentence." },
                            textCN: { type: Type.STRING, description: "Chinese translation of the sentence." }
                        },
                        required: ["text", "textCN"]
                    }
                  }
                },
                required: ["pageNumber", "lines"]
              }
            }
          }
        }
      }
    });

    const cleanText = cleanJsonString(response.text || "{}");
    const json = JSON.parse(cleanText);
    
    const pages: StoryPage[] = json.pages.map((p: any) => {
        // Fallback for backward compatibility if lines are missing (though schema enforces it)
        const lines = p.lines || [{ text: p.text || "", textCN: p.textCN || "" }];
        
        // Construct full text for legacy uses
        const fullText = lines.map((l: any) => l.text).join(' ');
        const fullTextCN = lines.map((l: any) => l.textCN).join(' ');

        return {
            pageNumber: p.pageNumber,
            text: fullText,
            textCN: fullTextCN,
            lines: lines,
            fallbackImagePrompt: "" 
        };
    });

    return { 
        title: json.title || "My Adventure", 
        pages,
        mainCharacterVisual: json.mainCharacterVisual || "A happy adventurer"
    };

  } catch (error) {
    console.error("Story Gen Error:", error);
    
    const w1 = items[0]?.word || "Item";
    return {
      title: "My Magic Day",
      mainCharacterVisual: "A happy child",
      pages: [
        { 
            pageNumber: 1, 
            text: "One day, I went on a big adventure.", 
            textCN: "有一天，我去进行了一次大冒险。",
            lines: [{ text: "One day, I went on a big adventure.", textCN: "有一天，我去进行了一次大冒险。" }]
        },
        { 
            pageNumber: 2, 
            text: `I found a *${w1}*! It was very cool.`, 
            textCN: `我发现了一个 *${w1}*！它非常酷。`,
            lines: [
                { text: `I found a *${w1}*!`, textCN: `我发现了一个 *${w1}*！` },
                { text: "It was very cool.", textCN: "它非常酷。" }
            ]
        },
        { pageNumber: 3, text: "The End.", textCN: "全剧终。", lines: [{ text: "The End.", textCN: "全剧终。" }] }
      ]
    };
  }
};

export const generateIllustration = async (prompt: string, style: string, characterVisual: string): Promise<string | null> => {
  try {
    // UPDATED PROMPT: Explicitly remove text/words
    const finalPrompt = `Kids book illustration, ${style}. ${characterVisual}. Action: ${prompt}. Colorful, high quality. No text, no words, no letters, no labels, no signboards.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: finalPrompt }]
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
        }
      }
    });
    
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                 return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }
    console.warn("No image data in response for prompt:", finalPrompt);
    return null;
  } catch (error) {
    console.error("Illustration Gen Error:", error);
    return null;
  }
};

// --- NEW STICKER GENERATION (Optimized) ---
export const generateSticker = async (imageBase64: string, word: string): Promise<string | null> => {
  try {
    // Optimize: Resize input to 512px max for much faster processing
    const resizedImage = await resizeImage(imageBase64, 512);
    const cleanData = cleanBase64(resizedImage);
    
    // Simplified prompt for efficiency and clarity
    const prompt = `Create a die-cut sticker of the "${word}" from this image. 
    1. Isolate the object on a white background. 
    2. Add a thick white sticker border. 
    3. Add a drop shadow. 
    4. Keep original colors. High quality.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: cleanData } },
          { text: prompt }
        ]
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
        }
      }
    });
    
    if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
                 return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
    }
    return null;
  } catch (error) {
    console.error("Sticker Gen Error:", error);
    return null;
  }
};
