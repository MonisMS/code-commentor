import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const MODEL_NAME = "gemini-1.5-flash";

const rateLimiter = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; 
const WINDOW_MS = 15 * 60 * 1000; 

function getRealIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  return 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const userLimit = rateLimiter.get(ip);
  
  if (!userLimit || now > userLimit.resetTime) {
    rateLimiter.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1, resetTime: now + WINDOW_MS };
  }
  
  if (userLimit.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0, resetTime: userLimit.resetTime };
  }
  
  userLimit.count++;
  return { allowed: true, remaining: RATE_LIMIT - userLimit.count, resetTime: userLimit.resetTime };
}

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
    const ip = getRealIP(request);
    const rateCheck = checkRateLimit(ip);
    
    if (!rateCheck.allowed) {
      const resetTimeSeconds = Math.ceil((rateCheck.resetTime - Date.now()) / 1000);
      return new Response(JSON.stringify({ 
        error: `Rate limit exceeded. Try again in ${Math.ceil(resetTimeSeconds / 60)} minutes.` 
      }), { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': RATE_LIMIT.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': rateCheck.resetTime.toString(),
          'Retry-After': resetTimeSeconds.toString()
        }
      });
    }

    const { code, personality } = await request.json();

    if (!code || !personality) {
        return new Response(JSON.stringify({ error: 'Missing code or personality' }), { status: 400 });
    }

    if (code.length > 3000) {
        return new Response(JSON.stringify({ error: 'Code snippet too long. Please limit to 3000 characters.' }), { status: 400 });
    }

    if (typeof code !== 'string' || typeof personality !== 'string') {
        return new Response(JSON.stringify({ error: 'Invalid input format' }), { status: 400 });
    }

    const fullPrompt = `You are an expert code analyst. Return ONLY valid JSON:
{"language": "detected_language", "commentedCode": "commented_code_here"}

Add ${personalityPrompts[personality]} style comments to this code:
${code}

Requirements: Detect language automatically, add inline comments, proper JSON escaping.`;

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { 
          responseMimeType: "application/json",
          temperature: 0.1,
          topK: 1,
          topP: 0.95,
          maxOutputTokens: 800,
        }
    });

    const safetySettings = [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
      safetySettings,
    });

    const responseText = result.response.text();

    let parsedJson;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (firstError) {
      try {
        const startIndex = responseText.indexOf('{');
        const endIndex = responseText.lastIndexOf('}');
        
        if (startIndex === -1 || endIndex === -1) {
          throw new Error("Could not find a valid JSON object in the AI's response.");
        }
        
        const jsonString = responseText.substring(startIndex, endIndex + 1);
        parsedJson = JSON.parse(jsonString);
      } catch (secondError) {
        console.error("Both JSON parsing attempts failed:", firstError, secondError);
        console.error("Response text:", responseText);
        throw new Error("AI returned malformed JSON response");
      }
    }

    if (!parsedJson || typeof parsedJson !== 'object' || !parsedJson.commentedCode) {
      throw new Error("Invalid response structure from AI service");
    }

    return new Response(JSON.stringify(parsedJson), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': RATE_LIMIT.toString(),
          'X-RateLimit-Remaining': rateCheck.remaining.toString(),
          'X-RateLimit-Reset': rateCheck.resetTime.toString()
        }
    });

  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error("API Error:", error);
    }
    
    if (error instanceof Error) {
      if (error.message.includes('429') || error.message.includes('quota')) {
        return new Response(JSON.stringify({ 
          error: 'API quota exceeded. Please try again later.' 
        }), { status: 429 });
      }
      
      if (error.message.includes('503') || error.message.includes('overloaded')) {
        return new Response(JSON.stringify({ 
          error: 'AI service is temporarily overloaded. Please try again in a few moments.' 
        }), { status: 503 });
      }
      
      if (error.message.includes('JSON') || error.message.includes('malformed')) {
        return new Response(JSON.stringify({ 
          error: 'AI returned invalid response format. Please try again.' 
        }), { status: 502 });
      }
    }
    
    return new Response(JSON.stringify({ 
      error: 'An error occurred while processing your request. Please try again.' 
    }), { status: 500 });
  }
}