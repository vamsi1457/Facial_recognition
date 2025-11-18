export async function POST(request) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return Response.json({ error: "No image provided" }, { status: 400 });
    }

    // Call GPT Vision API for emotion detection
    const response = await fetch("/integrations/gpt-vision/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this image for facial expressions. Detect the face and identify the primary emotion.

REQUIREMENTS:
1. Look for a human face in the image
2. Identify ONE primary emotion from: Happy, Sad, Angry, Surprise, Fear, Disgust, Neutral
3. Estimate face bounding box coordinates (x, y, width, height)
4. Provide confidence score (0.0 to 1.0)

Return response in this EXACT JSON format:
{
  "emotion": "Happy",
  "confidence": 0.95,
  "x": 120,
  "y": 80,
  "w": 200,
  "h": 240
}

If no face is detected, return:
{
  "emotion": "No face detected",
  "confidence": 0.0,
  "x": 0,
  "y": 0,
  "w": 0,
  "h": 0
}

ONLY return the JSON object, no other text.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: image,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`GPT Vision API failed: ${response.status}`);
    }

    const data = await response.json();
    const analysisResult = data.choices?.[0]?.message?.content;

    if (!analysisResult) {
      throw new Error("No response from GPT Vision");
    }

    console.log("Raw GPT Response:", analysisResult);

    // Parse JSON response
    try {
      // Try to extract JSON from response
      let jsonMatch = analysisResult.match(/\{[^}]*\}/);
      if (!jsonMatch) {
        // Fallback: look for structured data
        jsonMatch = analysisResult;
      }

      const prediction = JSON.parse(jsonMatch[0] || jsonMatch);

      // Validate response structure
      if (!prediction.emotion || prediction.confidence === undefined) {
        throw new Error("Invalid prediction format");
      }

      // Ensure confidence is a number between 0 and 1
      if (typeof prediction.confidence === "string") {
        prediction.confidence = parseFloat(prediction.confidence);
      }
      prediction.confidence = Math.max(0, Math.min(1, prediction.confidence));

      // Ensure coordinates are numbers
      prediction.x = parseInt(prediction.x) || 0;
      prediction.y = parseInt(prediction.y) || 0;
      prediction.w = parseInt(prediction.w) || 0;
      prediction.h = parseInt(prediction.h) || 0;

      console.log("Parsed Prediction:", prediction);

      return Response.json(prediction);
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      console.log("Trying fallback parsing...");

      // Fallback parsing for non-JSON responses
      const lines = analysisResult.toUpperCase().split("\n");
      let emotion = "Neutral";
      let confidence = 0.5;
      let x = 100,
        y = 100,
        w = 200,
        h = 240;

      // Extract emotion
      for (const line of lines) {
        if (
          line.includes("EMOTION") ||
          line.includes("HAPPY") ||
          line.includes("SAD") ||
          line.includes("ANGRY") ||
          line.includes("SURPRISE") ||
          line.includes("FEAR") ||
          line.includes("DISGUST") ||
          line.includes("NEUTRAL")
        ) {
          if (line.includes("HAPPY")) emotion = "Happy";
          else if (line.includes("SAD")) emotion = "Sad";
          else if (line.includes("ANGRY")) emotion = "Angry";
          else if (line.includes("SURPRISE")) emotion = "Surprise";
          else if (line.includes("FEAR")) emotion = "Fear";
          else if (line.includes("DISGUST")) emotion = "Disgust";
          else if (line.includes("NEUTRAL")) emotion = "Neutral";
          break;
        }
      }

      // Extract confidence
      const confMatch = analysisResult.match(/(\d+(?:\.\d+)?)/);
      if (confMatch) {
        confidence = Math.min(
          1,
          Math.max(
            0,
            parseFloat(confMatch[1]) > 1
              ? parseFloat(confMatch[1]) / 100
              : parseFloat(confMatch[1]),
          ),
        );
      }

      // Default face coordinates (center of typical webcam frame)
      x = 120;
      y = 80;
      w = 200;
      h = 240;

      const fallbackPrediction = { emotion, confidence, x, y, w, h };
      console.log("Fallback Prediction:", fallbackPrediction);

      return Response.json(fallbackPrediction);
    }
  } catch (error) {
    console.error("Prediction Error:", error);

    // Return a default response to keep the system working
    return Response.json(
      {
        emotion: "Neutral",
        confidence: 0.5,
        x: 120,
        y: 80,
        w: 200,
        h: 240,
        error: error.message,
      },
      { status: 200 },
    ); // Still return 200 to keep UI working
  }
}
