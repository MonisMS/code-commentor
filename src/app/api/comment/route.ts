import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: Request) {
  try {
    // Get API key
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), { status: 500 });
    }

    // Parse request
    const { code, personality } = await request.json();
    
    // Basic validation
    if (!code || !personality) {
      return new Response(JSON.stringify({ error: 'Missing code or personality' }), { status: 400 });
    }

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Simple prompt
    const prompt = `Add ${personality} style comments to this code and return ONLY valid JSON in this format:
{"language": "javascript", "commentedCode": "your commented code here"}

Code:
${code}`;

    // Generate response
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Parse JSON
    let parsedJson;
    try {
      parsedJson = JSON.parse(responseText);
    } catch {
      // Fallback if JSON parsing fails
      parsedJson = {
        language: "javascript",
        commentedCode: `// AI-generated comments\n${code}`
      };
    }

    return new Response(JSON.stringify(parsedJson), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('API Error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error'
    }), { status: 500 });
  }
}