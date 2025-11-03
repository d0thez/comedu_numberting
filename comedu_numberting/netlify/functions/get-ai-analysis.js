// Netlify 함수는 Node.js 환경에서 실행됩니다.
// 'fetch'는 최신 Node.js 버전에서 기본 제공됩니다.

// (A) 브라우저에서 보낸 데이터를 받는 핸들러 함수
exports.handler = async (event) => {
    
    // 1. 숨겨둔 API 키 가져오기 (Netlify 환경 변수에서)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "서버에 GEMINI_API_KEY가 설정되지 않았습니다." })
        };
    }

    // 2. 브라우저에서 보낸 데이터 파싱
    // (userAnswers, candidates, userOptionsCount, AI_QUESTIONS)
    let requestBody;
    try {
        requestBody = JSON.parse(event.body);
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ error: "잘못된 요청 데이터입니다." }) };
    }

    const { userAnswers, candidates, userOptionsCount, AI_QUESTIONS } = requestBody;

    if (!userAnswers || !candidates || !userOptionsCount || !AI_QUESTIONS) {
        return { statusCode: 400, body: JSON.stringify({ error: "필수 데이터가 누락되었습니다." }) };
    }

    // 3. (B) Google API에 보낼 프롬프트와 페이로드 구성
    // (기존 index.html의 getAINAnalysis 함수 내부 로직과 동일)
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;

    const systemPrompt = `당신은 '번호팅' 이벤트의 매칭 AI입니다.
참가자(뽑는 사람) 1명의 답변 3가지와, 다수의 후보자(번호 주인)들의 답변 3가지를 받게 됩니다.
심리학적으로 선정된 아래 3가지의 질문에 대한 대답을 바탕으로, 참가자와 후보자 간의 '일치율(matchScore)'을 평가해주세요.
질문은 다음과 같습니다: 
1.누구와 함께 있을때, 가장 편하다고 느끼는 순간은 언제인가요?
2.스트레스를 받을 때, 주로 어떤 방식으로 풀거나 대처하나요?
3.당신이 생각하는 '좋은 사람'은 어떤 사람인가요?
각 후보자가 참가자와 얼마나 잘 맞는지 0%에서 100% 사이의 '일치율(matchScore)'로 평가하고, 왜 그렇게 생각하는지 '매칭 이유(matchReason)'를 2~3줄로 요약해주세요.
결과는 반드시 JSON 배열 형식으로만 출력해야 합니다.
참가자가 요청한 인원수(${userOptionsCount}명)만큼 *가장 일치율이 높은 순서대로* 정렬하여 반환해주세요.`;

    const userQuery = `
# 참가자(뽑는 사람)의 답변:
- Q1(${AI_QUESTIONS[0]}): ${userAnswers[0]}
- Q2(${AI_QUESTIONS[1]}): ${userAnswers[1]}
- Q3(${AI_QUESTIONS[2]}): ${userAnswers[2]}

# 후보자(번호 주인) 목록:
${JSON.stringify(candidates.map(c => ({ id: c.id, q1: c.q1, q2: c.q2, q3: c.q3 })), null, 2)}

위 참가자의 답변과 각 후보자의 답변 3가지를 비교 분석하여, 일치율이 가장 높은 ${userOptionsCount}명을 JSON 배열 형식으로 반환해주세요.
필수 JSON 형식: [{"id": "후보자ID", "matchScore": 85, "matchReason": "두 사람 모두... 가치가 일치합니다."}]
형식은 지키되, 형식 외에서 답변 텍스트에 "후보자 ID"가 직접적으로 노출되지 않도록 주의하세요.
`;
    
    const jsonSchema = {
        type: "ARRAY",
        items: {
            type: "OBJECT",
            properties: {
                "id": { "type": "STRING" },
                "matchScore": { "type": "NUMBER" },
                "matchReason": { "type": "STRING" }
            },
            required: ["id", "matchScore", "matchReason"]
        }
    };
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
        }
    };

    // 4. (C) Google API 호출
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Gemini API 오류 (Status: ${response.status}):`, errorText);
            throw new Error(`AI 서버 오류: ${response.status}`);
        }

        const result = await response.json();

        if (!result.candidates || !result.candidates[0].content.parts[0].text) {
            console.error("Gemini API 응답 형식 오류:", result);
            throw new Error("AI가 유효한 응답을 생성하지 못했습니다.");
        }

        const jsonText = result.candidates[0].content.parts[0].text;
        
        // 5. (D) 성공 결과를 브라우저로 반환
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: jsonText // 파싱된 JSON 배열 텍스트를 그대로 반환
        };

    } catch (error) {
        console.error("Netlify 함수 실행 중 오류:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};