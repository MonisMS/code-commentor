"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function HomePage() {
  const [code, setCode] = useState("");
  const [personality, setPersonality] = useState("mentor");
  const [language, setLanguage] = useState("plaintext");
;

 
const [result, setResult] = useState(
  "// Your commented code will appear here..."
);
const [isLoading, setIsLoading] = useState(false);
const [loadingMessage, setLoadingMessage] = useState("");
const [copySuccess, setCopySuccess] = useState(false);


const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(result);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000); 
  } catch (err) {
    console.error('Failed to copy: ', err);
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = result;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  }
};


const handleSubmit = async () => {
  setIsLoading(true);
  setLanguage("plaintext");
  setLoadingMessage("Sending request...");
  setResult("// Analyzing, please wait...");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    setLoadingMessage("AI is analyzing your code...");

    const response = await fetch("/api/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, personality }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    setLoadingMessage("Processing response...");

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const statusText = response.statusText || "Unknown Error";
      
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const minutes = retryAfter ? Math.ceil(parseInt(retryAfter) / 60) : 15;
        throw new Error(`Rate limit exceeded. Please try again in ${minutes} minutes.`);
      }
      
      throw new Error(
        errorData?.error ||
          `Request failed with status: ${response.status} ${statusText}`
      );
    }

    const data = await response.json();
    console.log("API Response:", data); 
    
    
    const remaining = response.headers.get('X-RateLimit-Remaining');
    if (remaining && parseInt(remaining) <= 3) {
      console.log(`Rate limit warning: ${remaining} requests remaining`);
    }

    
    let commentedCode;
    if (data.commentedCode) {
      
      commentedCode = data.commentedCode
        .replace(/\\n/g, '\n')    
        .replace(/\\t/g, '\t')    
        .replace(/\\"/g, '"')     
        .replace(/\\\\/g, '\\');  
    } else if (data.code) {
      commentedCode = data.code;
    } else if (typeof data === 'string') {
      commentedCode = data;
    } else {
      throw new Error("No commented code returned from API");
    }

    
    const detectedLang = data.language ? data.language.toLowerCase() : "plaintext";

    setResult(commentedCode);
    setLanguage(detectedLang);
  } catch (error) {
    let errorMessage = "An unknown error occurred.";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        errorMessage =
          "Request timed out after 60 seconds. Please try again with a shorter code snippet.";
      } else if (error.message.includes("Rate limit exceeded")) {
        errorMessage = error.message;
      } else if (error.message.includes("Failed to fetch")) {
        errorMessage =
          "Network error. Please check your connection and try again.";
      } else {
        errorMessage = error.message;
      }
    }
    console.error("Failed to get response:", error);
    setResult(`// Error: ${errorMessage}`);
  } finally {
    setIsLoading(false);
    setLoadingMessage("");
  }
};

  return (
 <main className="flex min-h-screen flex-col items-center bg-gray-900 text-white p-4 sm:p-12">
    <div className="w-full max-w-4xl flex-grow flex flex-col">
      <div className="flex-grow">
          <h1 className="text-4xl sm:text-5xl font-bold text-center mb-2">
            AI Code Commenter 🤖
          </h1>
          <p className="text-center text-gray-400 mb-8">
            Paste your code, choose a personality, and get it commented
            instantly.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-grow">
              <label
                htmlFor="personality"
                className="block mb-2 text-sm font-medium text-gray-300"
              >
                Analysis Style
              </label>
              <select
                id="personality"
                value={personality}
                onChange={(e) => setPersonality(e.target.value)}
                className="w-full p-2.5 bg-gray-800 border border-gray-600 rounded-lg text-white"
              >
                <option value="mentor">Encouraging Mentor</option>
                <option value="minimalist">Minimalist Coder</option>
                <option value="intern">Humorous Intern</option>
                <option value="security">Security Analyst</option>
                <option value="performance">Performance Analyst</option>
              </select>
            </div>
            <button
              onClick={handleSubmit}
              disabled={isLoading || !code}
              className="w-full sm:w-auto self-end px-8 py-2.5 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-500"
            >
              {isLoading ? loadingMessage || "Analyzing..." : "Analyze Code"}
            </button>
          </div>

          <div className="w-full">
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Paste your code snippet here..."
              className="w-full h-96 p-4 font-mono text-sm bg-gray-800 border border-gray-600 rounded-lg"
            />
          </div>

          <div className="w-full mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Result</h2>
             <button
  onClick={copyToClipboard}
  disabled={result.includes("// Your commented code will appear here...") || result.includes("// Error:") || result.includes("// Analyzing, please wait...")}
  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
>
  {copySuccess ? "Copied!" : "Copy Code"}
</button>
            </div>
            <div className="w-full h-96 bg-gray-800 rounded-lg overflow-hidden">
              <SyntaxHighlighter
                language={language}
                style={atomDark}
                customStyle={{ margin: 0, height: "100%", padding: "1rem" }}
                wrapLongLines={true}
                showLineNumbers
              >
                {result}
              </SyntaxHighlighter>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Note: This analysis is based only on the provided snippet and
              lacks full codebase context.
            </p>
          </div>
        </div>

        <footer className="w-full text-center p-4 mt-8">
          <div className="flex justify-center items-center gap-4">
            <p className="text-gray-400">
              Made with ❤️ by{" "}
              <a
                href="https://x.com/SMSarwar47"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                Monis
              </a>
            </p>
          </div>
        </footer>
      </div>
    </main>
  );
}
