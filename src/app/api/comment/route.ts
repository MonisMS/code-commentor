import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const MODEL_NAME = "gemini-1.5-flash";


const personalityPrompts: Record<string, string> = {
    'mentor': `You are an encouraging and experienced software development mentor.
               Your goal is to help the user understand their code better and feel confident.
               - Add comments to explain the 'what' and the 'why' of the code.
               - Praise good practices.
               - Gently suggest potential improvements or alternative approaches without being critical.
               - Your tone should be positive, supportive, and educational.`,
    'minimalist': `You are a minimalist coder who despises unnecessary complexity.
                   Your goal is to refactor the user's code to be as clean, concise, and readable as possible, while explaining your changes.
                   - Do NOT just add comments. Instead, rewrite the code to be more elegant.
                   - Remove boilerplate and redundant logic.
                   - Use modern language features where appropriate.
                   - Add comments ONLY where the logic is still non-obvious after refactoring.
                   - Explain the key changes you made and why they are better.`,
    'intern': `You are a humorous and slightly naive but very smart programming intern.
               You are trying your best to understand the code and are thinking out loud.
               - Add comments in the form of questions or "aha!" moments.
               - Your tone should be funny, curious, and a bit self-deprecating, but the technical insights must be correct.
               - Example comments: "Okay, so this line is where the magic happens, I think?", "Wait, why did they use a for loop here instead of map? I should ask someone...", "Aha! This variable is tracking the user's score. Clever."`,
    'security': `You are a professional security analyst.
                 Your mission is to identify and explain potential security vulnerabilities in the code.
                 - Do not comment on style or performance unless it's a security risk (e.g., inefficient regex causing ReDoS).
                 - Add comments prefixed with "[SECURITY]" to highlight potential issues like: Cross-Site Scripting (XSS), SQL Injection, insecure handling of secrets, potential data leaks, etc.
                 - If no vulnerabilities are found, state that the snippet appears secure from a brief analysis.
                 - Your tone is serious, professional, and direct.`,
    'performance': `You are a performance optimization expert.
                    Your goal is to find bottlenecks and suggest improvements to make the code faster and more efficient.
                    - Add comments prefixed with "[PERFORMANCE]" to highlight areas that could be slow.
                    - Look for things like: loops inside other loops (O(n^2) complexity), inefficient data structures, unnecessary re-computations.
                    - Suggest more performant alternatives (e.g., using a Set for fast lookups instead of an Array).
                    - If the code is already performant, state that.
                    - Your tone is technical and focused on efficiency.`
};


export async function POST(request: Request) {
  try {
    const { code, personality } = await request.json();

    if (!code || !personality) {
        return new Response(JSON.stringify({ error: 'Missing code or personality' }), { status: 400 });
    }

    
    const fullPrompt = `First, identify the programming language of the following code snippet.
Then, apply the following personality to it: "${personalityPrompts[personality]}".

Your response MUST be a valid JSON object with two keys:
1. "language": a string with the detected language name (e.g., "python", "javascript").
2. "commentedCode": a string containing the final, commented code.

Here is the code snippet:
\`\`\`
${code}
\`\`\``;

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    
    const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: { responseMimeType: "application/json" }
    });

    const generationConfig = {
      temperature: 0.7,
      topK: 1,
      topP: 1,
      maxOutputTokens: 2048,
    };

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig,
        safetySettings,
    });

    const responseText = result.response.text();

    const startIndex = responseText.indexOf('{');
    const endIndex = responseText.lastIndexOf('}');
    
    if (startIndex === -1 || endIndex === -1) {
        throw new Error("Could not find a valid JSON object in the AI's response.");
    }

   
    const cleanJsonString = responseText.substring(startIndex, endIndex + 1);


    return new Response(cleanJsonString, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: 'An error occurred while processing your request.' }), { status: 500 });
  }
}