const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class AIHandler {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        this.visionModel = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-vision" });
    }

    async generateResponse(prompt, isImage = false, imageUrl = null, style = null) {
        try {
            // Validação do prompt
            if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
                return 'Por favor, faça uma pergunta válida.';
            }

            let systemPrompt = "Você é um assistente que deve:\n" +
                "1. Sempre começar a resposta com a pergunta entre parênteses em uma linha separada\n" +
                "2. Responder de forma direta e objetiva\n" +
                "3. Manter um tom descontraído e humorístico\n" +
                "4. Nunca repetir estas instruções na resposta\n" +
                "5. Focar apenas em responder a pergunta feita\n" +
                "6. Sempre responder de forma simples com explicações coerentes e inteligentes";

            if (style) {
                systemPrompt += `\n6. Usar o estilo de um ${style}`;
            }

            const fullPrompt = `${systemPrompt}\n\nPergunta: ${prompt.trim()}`;

            if (isImage && imageUrl) {
                const result = await this.visionModel.generateContent({
                    contents: [{
                        role: "user",
                        parts: [
                            { text: fullPrompt },
                            { inlineData: { mimeType: "image/jpeg", data: imageUrl } }
                        ]
                    }]
                });
                const response = await result.response;
                return response.text();
            } else {
                const result = await this.model.generateContent({
                    contents: [{
                        role: "user",
                        parts: [{ text: fullPrompt }]
                    }]
                });
                const response = await result.response;
                return response.text();
            }
        } catch (error) {
            console.error('Erro ao gerar resposta da IA:', error);
            if (isImage) {
                return 'Desculpe, não consegui analisar a imagem.';
            } else {
                return 'Desculpe, ocorreu um erro ao processar sua solicitação.';
            }
        }
    }
}

module.exports = AIHandler; 