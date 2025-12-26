
import { GoogleGenAI, Type } from "@google/genai";
import { Video, UserInteractions } from "./types";

export interface VideoInsight {
  summary: string;
  horrorLevel: number;
  tags: string[];
}

/**
 * تحليل فيديو رعب باستخدام Gemini
 */
export async function analyzeHorrorVideo(videoBase64: string, mimeType: string): Promise<VideoInsight> {
  // Always initialize GoogleGenAI with a named parameter using process.env.API_KEY
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: videoBase64, mimeType } },
            { text: "حلل هذا الفيديو المرعب. استخرج ملخصاً قصيراً جداً، مستوى الرعب من 1 إلى 10، وبعض الكلمات المفتاحية (Tags) باللغة العربية." }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            horrorLevel: { type: Type.NUMBER },
            tags: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["summary", "horrorLevel", "tags"]
        }
      }
    });

    // Extract text output using .text property
    return JSON.parse(response.text || '{}') as VideoInsight;
  } catch (error) {
    console.error("Analysis Error:", error);
    return { summary: "تعذر التحليل، لكن الروح موجودة..", horrorLevel: 5, tags: ["رعب", "غموض"] };
  }
}

/**
 * اقتراح أوسمة بناءً على العنوان
 */
export async function suggestTags(title: string, category: string): Promise<string[]> {
  // Initialize GoogleGenAI right before the API call as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  try {
    const response = await ai.models.generateContent({
      model,
      contents: `بناءً على عنوان فيديو الرعب هذا: "${title}" والتصنيف: "${category}"، اقترح 5 أوسمة (tags) قصيرة ومثيرة للرعب باللغة العربية. أرجعها كقائمة JSON فقط.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    // Extract text output using .text property
    return JSON.parse(response.text || '[]');
  } catch (e) {
    return ["رعب", "قصص_مخيفة"];
  }
}

/**
 * محرك ترتيب المحتوى الذكي (AI Discovery Engine)
 * يقوم بترتيب الفيديوهات بناءً على اهتمامات المستخدم وسجل مشاهداته
 */
export async function getRecommendedFeed(allVideos: Video[], interactions: UserInteractions): Promise<string[]> {
  // Initialize GoogleGenAI right before the API call as per guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-3-flash-preview';
  
  // نرسل العناوين والتصنيفات للذكاء الاصطناعي ليقرر الأفضل
  const videoData = allVideos.map(v => ({ id: v.id, title: v.title, category: v.category }));
  const historyTitles = allVideos
    .filter(v => interactions.watchHistory.some(h => h.id === v.id))
    .map(v => v.title);

  const prompt = `
    أنت خبير في رعب المحتوى الرقمي. لديك قائمة فيديوهات: ${JSON.stringify(videoData)}.
    المستخدم شاهد سابقاً: ${JSON.stringify(historyTitles)}.
    المستخدم أعجب بـ IDs: ${JSON.stringify(interactions.likedIds)}.
    
    قم بترتيب IDs الفيديوهات بحيث تظهر الفيديوهات الأكثر رعباً وتشابهاً مع اهتماماته أولاً.
    تجنب تكرار ما شاهده المستخدم بكثرة.
    أرجع فقط مصفوفة JSON تحتوي على الـ IDs المرتبة.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    // Extract text output using .text property
    return JSON.parse(response.text || "[]");
  } catch (e) {
    // في حال الفشل نعود للترتيب العشوائي
    return allVideos.map(v => v.id).sort(() => Math.random() - 0.5);
  }
}
