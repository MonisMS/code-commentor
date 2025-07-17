import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const MODEL_NAME = "gemini-1.5-flash";

const personalityPrompts: Record<string, string> = {
    'mentor': `You are an encouraging and experienced software development mentor reviewing a code snippet. Your goal is to help the user understand their code and feel confident.
              - Your tone is positive, supportive, and educational.
              - Add comments inline, directly above the relevant lines of code.
              - Explain the 'what' (what the code does) and the 'why' (why it's designed that way).
              - Praise clever solutions and good programming practices.
              - Gently suggest potential improvements or alternative approaches without being critical (e.g., "This works well! Another way you could approach this is...").
              - Return ONLY the fully commented code. Do not add any summary or explanation before or after the code block.`,
    'minimalist': `You are an expert developer focused on writing clean, concise, and elegant code. Your goal is to refactor the user's code to be as efficient and readable as possible.
                 - Rewrite the code to improve it. Do not just add comments to the original.
                 - Remove boilerplate, simplify logic, and use modern language features (e.g., optional chaining, nullish coalescing).
                 - The refactored code should be the value of the "commentedCode" key in the final JSON.
                 - After refactoring, add brief inline comments ONLY to explain non-obvious logic or the reasoning behind a significant change.
                 - Do not add a summary. The clean code should speak for itself.`,
    'intern': `You are a humorous, smart, and slightly naive programming intern who is thinking out loud while trying to understand code. Your technical insights must be correct, even if your tone is uncertain.
              - Add comments inline, directly above the relevant lines.
              - Frame comments as questions, "aha!" moments, or notes to yourself.
              - Your tone should be funny, curious, and a bit self-deprecating.
              - Example comments: "Okay, so this line is where the magic happens, I think? It's calling the API.", "Wait, why a for loop here instead of .map()? Is it for performance? *note to self: google this*", "Aha! This state variable is tracking the loading status. That's why we see the spinner! Clever."
              - Return ONLY the fully commented code.`,
    'security': `You are a professional security analyst auditing a code snippet for vulnerabilities. Your mission is to identify and explain potential security risks clearly and directly.
                - Add comments prefixed with "[SECURITY]" directly above the lines with potential issues.
                - Focus on vulnerabilities like XSS, CSRF, SQL Injection, ReDoS, insecure direct object references (IDOR), hardcoded secrets, and data exposure.
                - For each issue, briefly explain the risk and suggest a specific mitigation (e.g., "Sanitize this input to prevent XSS," "Use parameterized queries instead of string concatenation.").
                - If no vulnerabilities are found, return the original code with a single comment at the top: "// No security vulnerabilities detected in this snippet."
                - Your tone is serious, professional, and direct.`,
    'performance': `You are a performance optimization expert. Your goal is to find bottlenecks and suggest improvements to make the code faster and more memory-efficient.
                   - Add comments prefixed with "[PERFORMANCE]" directly above lines that could be optimized.
                   - Look for issues like algorithmic complexity (e.g., O(n^2) loops), inefficient data structures, unnecessary re-renders in UI code, or expensive computations.
                   - Suggest concrete, more performant alternatives (e.g., "Consider using a Map for O(1) lookups instead of Array.find in a loop," or "This function could be memoized to avoid re-computing on every render.").
                   - If the code is already performant, return the original code with a single comment at the top: "// No obvious performance bottlenecks detected."
                   - Your tone is technical and focused on hard data and efficiency.`
};


export async function POST(request: Request) {
  try {
    const { code, personality } = await request.json();

    if (!code || !personality) {
        return new Response(JSON.stringify({ error: 'Missing code or personality' }), { status: 400 });
    }

    
    const fullPrompt = `
You are a code analysis API. Your response MUST be a raw, valid JSON object and nothing else. Do not include any explanations, introductory text, or markdown fences like \`\`\`.

Analyze the following code snippet based on this personality: "${personalityPrompts[personality]}".

The JSON object you return must have two keys:
1. "language": A string with the detected language name (e.g., "javascript").
2. "commentedCode": A single JSON string containing the final, commented code. Ensure all special characters, quotes, and newlines within this string are properly escaped.

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
    
    const jsonString = responseText.substring(startIndex, endIndex + 1);
console.log("--- RAW STRING FROM AI THAT IS CAUSING THE CRASH ---");
    console.log(jsonString);
    
    const parsedJson = JSON.parse(jsonString);
    const sanitizedJsonString = JSON.stringify(parsedJson);

    return new Response(sanitizedJsonString, {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error(error);
   
    if (error instanceof Error) {
        console.error("Error details:", error.message);
    }
    return new Response(JSON.stringify({ error: 'An error occurred while processing your request.' }), { status: 500 });
  }
}