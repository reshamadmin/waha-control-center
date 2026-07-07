export interface AIProvider {
  analyzeText(prompt: string): Promise<string>;
  generateSuggestedReply(chatHistory: string): Promise<string>;
}
